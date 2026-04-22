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

        # AppSync Events API (pub/sub channels, not GraphQL)
        self.events_api = appsync.CfnApi(
            self, "ChatEventsApi",
            name="nextservice-chat-events",
            event_config=appsync.CfnApi.EventConfigProperty(
                auth_providers=[
                    appsync.CfnApi.AuthProviderProperty(
                        auth_type="API_KEY",
                    ),
                ],
                connection_auth_modes=[
                    appsync.CfnApi.AuthModeProperty(auth_type="API_KEY"),
                ],
                default_publish_auth_modes=[
                    appsync.CfnApi.AuthModeProperty(auth_type="API_KEY"),
                ],
                default_subscribe_auth_modes=[
                    appsync.CfnApi.AuthModeProperty(auth_type="API_KEY"),
                ],
            ),
        )

        # API Key (valid for 365 days — the AWS hard maximum).
        # The key is auto-extended monthly by the rotator Lambda below so the
        # value never changes and live chat sessions don't drop.
        expires_at = datetime.datetime.now() + datetime.timedelta(days=365)
        self.api_key = appsync.CfnApiKey(
            self, "ChatApiKey",
            api_id=self.events_api.attr_api_id,
            description="NextService chat events API key",
            expires=int(expires_at.timestamp()),
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
