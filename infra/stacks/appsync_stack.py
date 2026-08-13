import os
import datetime

from aws_cdk import (
    Stack,
    CfnOutput,
    Duration,
    aws_appsync as appsync,
    aws_lambda as lambda_,
    aws_iam as iam,
    aws_events as events,
    aws_events_targets as events_targets,
    aws_cloudwatch as cw,
    aws_cloudwatch_actions as cw_actions,
    aws_sns as sns,
)


# How often the rotator runs. AppSync keys max out at 365 days, so we rotate
# well before that with a 2-month buffer. If one rotation fails, we have time
# to fix it before the key actually expires.
ROTATOR_INTERVAL_DAYS = 300
from constructs import Construct



# Transition flag. True keeps the old API-key path working while the new app
# build rolls out; flip to False (and redeploy) to make the Lambda authorizer
# the only way in, which is what actually secures the chat channels.
ALLOW_API_KEY = True

# Matches the value recorded in the DEPLOYED CloudFormation template, so a plain
# `cdk deploy` produces no diff on this resource.
#
# Note this is not identical to the expiry the live key reports: the rotator
# Lambda extends the real key through the AppSync API, which CloudFormation
# never sees. Pinning to the template's value is what keeps deploys a no-op
# here; the rotator remains the owner of the actual expiry.
PINNED_KEY_EXPIRES = 1808950258


def _auth_modes(appsync):
    modes = [appsync.CfnApi.AuthModeProperty(auth_type="AWS_LAMBDA")]
    if ALLOW_API_KEY:
        modes.append(appsync.CfnApi.AuthModeProperty(auth_type="API_KEY"))
    return modes


def _required_env(name: str) -> str:
    """Reads a deploy-time secret, refusing to synthesize without it.

    Defaulting to an empty string here would be worse than failing: the stack
    would deploy cleanly and the authorizer would then reject every single
    connection, which looks like a broken chat rather than a missing variable.
    """
    value = os.environ.get(name)
    if not value:
        raise ValueError(
            f"{name} is required to deploy the AppSync stack. "
            f"Export it first — see the comment on the authorizer's environment block."
        )
    return value

class AppSyncStack(Stack):
    """AppSync Events API for real-time chat."""

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        alert_topic: sns.ITopic | None = None,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ── Authorizer ───────────────────────────────────────────
        # API_KEY alone is not an access control here: the key is published to
        # every browser as NEXT_PUBLIC_APPSYNC_API_KEY, so holding it proves
        # nothing about who you are. With key-only auth on subscribe/publish,
        # anyone could read or forge messages on any chat channel.
        #
        # This Lambda validates a short-lived token minted by
        # /api/realtime/token and checks the caller against the specific channel
        # they are trying to use.
        self.authorizer_fn = lambda_.Function(
            self, "EventsAuthorizerFn",
            function_name="nextservice-appsync-authorizer",
            description="Authorizes AppSync Events connect/subscribe/publish per channel",
            runtime=lambda_.Runtime.NODEJS_20_X,
            handler="index.handler",
            code=lambda_.Code.from_asset("lambdas/appsync-authorizer"),
            memory_size=256,
            timeout=Duration.seconds(10),
            environment={
                "SERVICE_REQUESTS_TABLE": "ServiceRequests",
                # Must match the value the Next.js app signs with. Read from the
                # deploy environment so it never lands in source control, and
                # required rather than defaulted: silently deploying an empty
                # secret would make the authorizer reject every connection and
                # take chat down with no obvious cause.
                #
                # Fetch it from the Amplify app before deploying:
                #   export REALTIME_JWT_SECRET=$(aws amplify get-app \
                #     --app-id d3ku6yajf4j6y8 --region eu-central-1 \
                #     --query 'app.environmentVariables.REALTIME_JWT_SECRET' \
                #     --output text)
                "REALTIME_JWT_SECRET": _required_env("REALTIME_JWT_SECRET"),
            },
        )
        self.authorizer_fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=["dynamodb:GetItem"],
                resources=[
                    f"arn:aws:dynamodb:{self.region}:{self.account}:table/ServiceRequests"
                ],
            )
        )

        # AppSync Events API (pub/sub channels, not GraphQL)
        self.events_api = appsync.CfnApi(
            self, "ChatEventsApi",
            name="nextservice-chat-events",
            event_config=appsync.CfnApi.EventConfigProperty(
                # ── TRANSITION STATE — see ALLOW_API_KEY below ──────────
                # Both providers are accepted so the infrastructure and the app
                # can be rolled out in either order without a window where chat
                # is broken: the currently deployed app still sends an API key,
                # and the new build sends a bearer token.
                #
                # THIS DOES NOT YET CLOSE THE HOLE. While API_KEY is accepted,
                # anyone holding the public key can still subscribe to any
                # channel. Set ALLOW_API_KEY = False and redeploy once the new
                # app build is live in Amplify — that is the change that
                # actually secures the chat.
                auth_providers=[
                    appsync.CfnApi.AuthProviderProperty(
                        auth_type="AWS_LAMBDA",
                        lambda_authorizer_config=appsync.CfnApi.LambdaAuthorizerConfigProperty(
                            authorizer_uri=self.authorizer_fn.function_arn,
                            authorizer_result_ttl_in_seconds=300,
                        ),
                    ),
                    *([appsync.CfnApi.AuthProviderProperty(auth_type="API_KEY")]
                      if ALLOW_API_KEY else []),
                ],
                connection_auth_modes=_auth_modes(appsync),
                default_publish_auth_modes=_auth_modes(appsync),
                default_subscribe_auth_modes=_auth_modes(appsync),
            ),
        )

        # AppSync must be allowed to invoke the authorizer.
        self.authorizer_fn.add_permission(
            "AppSyncInvokeAuthorizer",
            principal=iam.ServicePrincipal("appsync.amazonaws.com"),
            action="lambda:InvokeFunction",
            source_arn=f"arn:aws:appsync:{self.region}:{self.account}:apis/{self.events_api.attr_api_id}",
        )

        # API Key (valid for 365 days — the AWS hard maximum).
        # The key is auto-extended by the rotator Lambda below, so the value
        # never changes and live chat sessions don't drop.
        #
        # `expires` is NOT recomputed as now+365 on every synth. Doing that made
        # the property differ on every single deploy, and CloudFormation reported
        # the key as "may be replaced" — a replacement would mint a NEW key
        # value while NEXT_PUBLIC_APPSYNC_API_KEY in Amplify still held the old
        # one, breaking chat for everyone. Pin it instead, and let the rotator
        # own the actual expiry at runtime.
        #
        # Override only when deliberately extending from CDK:
        #   export APPSYNC_KEY_EXPIRES=$(date -v+365d +%s)
        expires_at = int(os.environ.get("APPSYNC_KEY_EXPIRES", PINNED_KEY_EXPIRES))
        self.api_key = appsync.CfnApiKey(
            self, "ChatApiKey",
            api_id=self.events_api.attr_api_id,
            description="NextService chat events API key",
            expires=expires_at,
        )

        # Channel namespace — all channels go under /default/*
        self.channel_namespace = appsync.CfnChannelNamespace(
            self, "DefaultNamespace",
            api_id=self.events_api.attr_api_id,
            name="default",
        )

        # DNS endpoints are derived from API ID:
        #   HTTP:      {apiId}.appsync-api.{region}.amazonaws.com
        #   Realtime:  {apiId}.appsync-realtime-api.{region}.amazonaws.com
        api_id = self.events_api.attr_api_id
        region = self.region

        self.http_endpoint = f"{api_id}.appsync-api.{region}.amazonaws.com"
        self.realtime_endpoint = f"{api_id}.appsync-realtime-api.{region}.amazonaws.com"

        # ── API Key auto-rotator ────────────────────────────────
        # AppSync API keys max out at 365 days. Without rotation, chat breaks
        # for everyone one year after the last deploy. This Lambda runs
        # monthly via EventBridge and calls UpdateApiKey to push `Expires`
        # back to (now + 365 days). UpdateApiKey *extends* the key — the
        # value does NOT change, so clients are unaffected.
        rotator_fn = lambda_.Function(
            self, "ApiKeyRotatorFn",
            function_name="nextservice-appsync-key-rotator",
            description="Extend AppSync API key expiration back to 365 days",
            runtime=lambda_.Runtime.NODEJS_20_X,
            handler="index.handler",
            code=lambda_.Code.from_asset("lambdas/appsync-key-rotator"),
            memory_size=128,
            timeout=Duration.seconds(30),
            environment={
                "APPSYNC_API_ID": api_id,
            },
        )
        rotator_fn.add_to_role_policy(iam.PolicyStatement(
            sid="RotateAppSyncApiKeys",
            actions=[
                "appsync:ListApiKeys",
                "appsync:UpdateApiKey",
            ],
            resources=[
                f"arn:aws:appsync:{region}:{self.account}:apis/*",
            ],
        ))

        # EventBridge: fire every ROTATOR_INTERVAL_DAYS days (300 = ~10 months).
        # Gives us a 2-month buffer before the key would actually expire if a
        # rotation run fails — plenty of time for the CW alarm → email to
        # reach the operator and a manual rotation to happen.
        events.Rule(
            self, "ApiKeyRotatorSchedule",
            rule_name="nextservice-appsync-key-rotator",
            description=f"AppSync API key expiration extension (every {ROTATOR_INTERVAL_DAYS}d)",
            schedule=events.Schedule.rate(Duration.days(ROTATOR_INTERVAL_DAYS)),
            targets=[events_targets.LambdaFunction(rotator_fn)],
        )

        # Error alarm — if the rotator ever fails, we want to know *long*
        # before the key could expire.
        if alert_topic is not None:
            rotator_alarm = cw.Alarm(
                self, "ApiKeyRotatorAlarm",
                alarm_name="NextService-AppSync-KeyRotator-Errors",
                alarm_description=(
                    "AppSync key rotator Lambda failed — investigate before "
                    "the API key naturally expires (max 365 days)."
                ),
                metric=rotator_fn.metric_errors(
                    period=Duration.hours(1),
                    statistic="Sum",
                ),
                threshold=0,
                evaluation_periods=1,
                comparison_operator=cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
                treat_missing_data=cw.TreatMissingData.NOT_BREACHING,
            )
            rotator_alarm.add_alarm_action(cw_actions.SnsAction(alert_topic))

        # ── Outputs ─────────────────────────────────────────────
        CfnOutput(self, "AppSyncApiId",
                  value=api_id,
                  export_name="NextService-AppSyncApiId")
        CfnOutput(self, "AppSyncHttpEndpoint",
                  value=self.http_endpoint,
                  export_name="NextService-AppSyncHttpEndpoint")
        CfnOutput(self, "AppSyncRealtimeEndpoint",
                  value=self.realtime_endpoint,
                  export_name="NextService-AppSyncRealtimeEndpoint")
        CfnOutput(self, "AppSyncApiKey",
                  value=self.api_key.attr_api_key,
                  export_name="NextService-AppSyncApiKey")
