"""
NotificationsStack
==================
Decoupled, stream-driven email broadcasts.

Wiring:
  ServiceRequests (DynamoDB Streams, NEW_IMAGE)
          │
          ▼
  NewRequestBroadcast Lambda  ──►  SES (email to every active garage)
          │
          ├──►  EmailLogs (audit row per recipient)
          │
          └──►  SQS DLQ (only permanent failures)
                  │
                  ▼
             CloudWatch alarm → SNS (alert email)

Design notes:
- Lambda is self-contained Node.js 20 (no bundler), relying on the AWS SDK v3
  that ships with the runtime. See `infra/lambdas/new-request-broadcast/`.
- INSERT-only filter on the event source so MODIFY/REMOVE events are dropped
  at the stream layer (no Lambda invocation, no cost).
- `bisect_batch_on_error=True` narrows failing batches down to the poison
  record so one bad row doesn't block the shard.
- Lambda reserved concurrency is intentionally modest — SES sending rate is
  the real bottleneck; raise both together.
"""

from aws_cdk import (
    Stack,
    CfnOutput,
    Duration,
    aws_lambda as lambda_,
    aws_lambda_event_sources as lambda_events,
    aws_events as events,
    aws_events_targets as events_targets,
    aws_iam as iam,
    aws_sqs as sqs,
    aws_cloudwatch as cw,
    aws_cloudwatch_actions as cw_actions,
    aws_sns as sns,
    aws_sns_subscriptions as sns_subs,
    aws_ses as ses,
)
from constructs import Construct


# SES Configuration Set name. Referenced here *and* in the senders
# (`src/utils/emailService.ts` + `infra/lambdas/new-request-broadcast`) via
# the `X-SES-CONFIGURATION-SET` MIME header. If you rename, update all three.
SES_CONFIG_SET_NAME = "nextservice-main"


class NotificationsStack(Stack):
    """Stream → Lambda → SES broadcast pipeline."""

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        service_requests_stream_arn: str,
        service_requests_table_arn: str,
        garages_table_arn: str,
        alert_topic: sns.ITopic,
        app_url: str,
        notifications_enabled: bool = True,
        ses_from_address: str = "no-reply@nextservice.gr",
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ── SES Configuration Set ───────────────────────────────
        # Every outbound email is tagged with this config set (via the
        # `X-SES-CONFIGURATION-SET` MIME header). That unlocks:
        #   - Per-email delivery / bounce / complaint events (routed to SNS
        #     below → processor Lambda → EmailLogs row update).
        #   - Automatic open tracking (1x1 pixel injection) and click tracking
        #     (link rewriting) using the default `r.<region>.awstrack.me`
        #     tracking domain.
        #   - Reputation metrics emitted to CloudWatch for the alarms further
        #     down the file.
        self.config_set = ses.CfnConfigurationSet(
            self, "MainConfigSet",
            name=SES_CONFIG_SET_NAME,
            reputation_options=ses.CfnConfigurationSet.ReputationOptionsProperty(
                reputation_metrics_enabled=True,
            ),
            # send_enabled defaults to True — don't force it or we lose the
            # ability to pause sends from the AWS console without a deploy.
        )

        # ── SNS topic for SES events ────────────────────────────
        # Separate topic from the operator alert topic. SES publishes ONE
        # message per lifecycle event (send/delivery/bounce/complaint/open/
        # click/reject/deliveryDelay/renderingFailure). The processor Lambda
        # is the sole subscriber.
        ses_events_topic = sns.Topic(
            self, "SESEventsTopic",
            topic_name="nextservice-ses-events",
            display_name="NextService SES Events",
        )
        # Allow SES to publish to the topic. Source account condition locks
        # this down to our own events — third-party accounts can't spam us.
        ses_events_topic.add_to_resource_policy(iam.PolicyStatement(
            sid="AllowSESPublish",
            effect=iam.Effect.ALLOW,
            principals=[iam.ServicePrincipal("ses.amazonaws.com")],
            actions=["sns:Publish"],
            resources=[ses_events_topic.topic_arn],
            conditions={
                "StringEquals": {"AWS:SourceAccount": self.account},
            },
        ))

        event_destination = ses.CfnConfigurationSetEventDestination(
            self, "MainEventDestination",
            configuration_set_name=SES_CONFIG_SET_NAME,
            event_destination=ses.CfnConfigurationSetEventDestination.EventDestinationProperty(
                name="sns-events",
                enabled=True,
                matching_event_types=[
                    "send",
                    "reject",
                    "bounce",
                    "complaint",
                    "delivery",
                    "open",
                    "click",
                    "renderingFailure",
                    "deliveryDelay",
                ],
                sns_destination=ses.CfnConfigurationSetEventDestination.SnsDestinationProperty(
                    topic_arn=ses_events_topic.topic_arn,
                ),
            ),
        )
        # The config set must exist before the destination references it.
        event_destination.add_dependency(self.config_set)

        # ── SES event processor Lambda ──────────────────────────
        # Consumes SNS messages → parses the SES event → looks up the
        # EmailLogs row by the custom `X-Nextservice-EmailId` header →
        # updates status + timestamps (deliveredAt, openedAt, clickedAt,
        # bouncedAt, complainedAt) and counters (openCount, clickCount).
        self.ses_processor_fn = lambda_.Function(
            self, "SesEventProcessorFn",
            function_name="nextservice-ses-event-processor",
            description="Update EmailLogs rows from SES Configuration Set events",
            runtime=lambda_.Runtime.NODEJS_20_X,
            handler="index.handler",
            code=lambda_.Code.from_asset("lambdas/ses-event-processor"),
            memory_size=192,
            timeout=Duration.seconds(30),
            environment={
                "EMAIL_LOGS_TABLE": "EmailLogs",
            },
        )
        self.ses_processor_fn.add_to_role_policy(iam.PolicyStatement(
            sid="UpdateEmailLogs",
            actions=["dynamodb:UpdateItem"],
            resources=[
                f"arn:aws:dynamodb:{self.region}:{self.account}:table/EmailLogs",
            ],
        ))
        ses_events_topic.add_subscription(
            sns_subs.LambdaSubscription(self.ses_processor_fn)
        )

        # ── Dead-letter queue ───────────────────────────────────
        # Records that permanently fail (after all retry_attempts) land here
        # so a human can inspect them. 14-day retention is the SQS maximum.
        self.dlq = sqs.Queue(
            self, "NewRequestBroadcastDLQ",
            queue_name="nextservice-new-request-broadcast-dlq",
            retention_period=Duration.days(14),
        )

        # ── Lambda function ─────────────────────────────────────
        self.broadcast_fn = lambda_.Function(
            self, "NewRequestBroadcastFn",
            function_name="nextservice-new-request-broadcast",
            description="Fan-out new service request → active garages via SES",
            runtime=lambda_.Runtime.NODEJS_20_X,
            handler="index.handler",
            code=lambda_.Code.from_asset("lambdas/new-request-broadcast"),
            # 256MB is plenty for this workload — memory mostly drives CPU
            # allocation, and we need enough CPU for base64 encoding + TLS.
            memory_size=256,
            # Scanning garages + sending N emails must finish within this.
            # At 400 garages with concurrency=10 we're well under this limit;
            # raise if we ever approach 2000+ garages per request.
            timeout=Duration.minutes(2),
            environment={
                "SES_FROM_ADDRESS": ses_from_address,
                "SES_CONFIG_SET": SES_CONFIG_SET_NAME,
                "APP_URL": app_url,
                "GARAGES_TABLE": "Garages",
                "EMAIL_LOGS_TABLE": "EmailLogs",
                "NOTIFICATIONS_ENABLED": "true" if notifications_enabled else "false",
                "SEND_CONCURRENCY": "10",
            },
            # NOTE: no `reserved_concurrent_executions` — AWS requires every
            # account to keep ≥10 unreserved for the shared pool, and a new
            # account's default quota starts at 10. Reserving here would
            # starve every other Lambda (Amplify SSR, the SES processor,
            # the AppSync rotator). The DynamoDB Stream event source
            # already gives us natural throttling via parallelization_factor=1
            # + batch_size=10. If we ever need a hard SES-rate cap, raise
            # the account quota first (Service Quotas → Lambda → Concurrent
            # executions), then add the reservation back.
        )

        # ── IAM permissions ─────────────────────────────────────
        # DynamoDB: Scan Garages, Put+Update EmailLogs
        self.broadcast_fn.add_to_role_policy(iam.PolicyStatement(
            sid="ScanGarages",
            actions=["dynamodb:Scan"],
            resources=[garages_table_arn],
        ))
        self.broadcast_fn.add_to_role_policy(iam.PolicyStatement(
            sid="WriteEmailLogs",
            actions=[
                "dynamodb:PutItem",
                "dynamodb:UpdateItem",
            ],
            resources=[
                f"arn:aws:dynamodb:{self.region}:{self.account}:table/EmailLogs",
            ],
        ))
        # SES send
        # When the sender tags an email with X-SES-CONFIGURATION-SET (we do —
        # see infra/lambdas/new-request-broadcast/index.mjs), SES enforces the
        # ses:SendEmail / ses:SendRawEmail action against BOTH the identity
        # *and* the configuration-set resource. Missing the latter throws:
        #   "not authorized to perform `ses:SendRawEmail` on resource
        #    `arn:aws:ses:.../configuration-set/nextservice-main`"
        self.broadcast_fn.add_to_role_policy(iam.PolicyStatement(
            sid="SESSendEmail",
            actions=[
                "ses:SendEmail",
                "ses:SendRawEmail",
            ],
            resources=[
                f"arn:aws:ses:{self.region}:{self.account}:identity/*",
                f"arn:aws:ses:{self.region}:{self.account}:configuration-set/{SES_CONFIG_SET_NAME}",
            ],
        ))

        # ── Event source (DynamoDB Stream → Lambda) ─────────────
        # Use L1 CfnEventSourceMapping — the L2 DynamoEventSource construct
        # in this CDK version doesn't expose the INSERT-only filter as a
        # first-class arg, but CfnEventSourceMapping does via `filter_criteria`.
        lambda_.CfnEventSourceMapping(
            self, "ServiceRequestsStreamMapping",
            function_name=self.broadcast_fn.function_name,
            event_source_arn=service_requests_stream_arn,
            starting_position="LATEST",
            batch_size=10,
            maximum_batching_window_in_seconds=5,
            # Retry bad batches a few times, then dead-letter them.
            maximum_retry_attempts=3,
            # Don't retry records older than 1h — if SES has been down that
            # long we've got bigger problems and replaying stale "new" request
            # emails is worse than just dropping them.
            maximum_record_age_in_seconds=3600,
            bisect_batch_on_function_error=True,
            parallelization_factor=1,
            destination_config=lambda_.CfnEventSourceMapping.DestinationConfigProperty(
                on_failure=lambda_.CfnEventSourceMapping.OnFailureProperty(
                    destination=self.dlq.queue_arn,
                ),
            ),
            filter_criteria=lambda_.CfnEventSourceMapping.FilterCriteriaProperty(
                filters=[
                    lambda_.CfnEventSourceMapping.FilterProperty(
                        pattern='{"eventName":["INSERT"]}',
                    ),
                ],
            ),
        )

        # Grant the Lambda permission to read from the stream and write to DLQ.
        # These aren't covered by the managed event-source construct because
        # we're using the L1 CfnEventSourceMapping above.
        self.broadcast_fn.add_to_role_policy(iam.PolicyStatement(
            sid="ReadServiceRequestsStream",
            actions=[
                "dynamodb:DescribeStream",
                "dynamodb:GetRecords",
                "dynamodb:GetShardIterator",
                "dynamodb:ListStreams",
            ],
            resources=[service_requests_stream_arn],
        ))
        self.dlq.grant_send_messages(self.broadcast_fn)

        # ── DLQ depth alarm ─────────────────────────────────────
        # Any message in the DLQ means at least one broadcast failed
        # permanently — operators need to know.
        dlq_alarm = cw.Alarm(
            self, "BroadcastDLQAlarm",
            alarm_name="NextService-BroadcastDLQ-NotEmpty",
            alarm_description=(
                "Broadcast Lambda sent a record to the DLQ — "
                "an email broadcast failed permanently."
            ),
            metric=self.dlq.metric_approximate_number_of_messages_visible(
                period=Duration.minutes(5),
                statistic="Maximum",
            ),
            threshold=0,
            evaluation_periods=1,
            comparison_operator=cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treat_missing_data=cw.TreatMissingData.NOT_BREACHING,
        )
        dlq_alarm.add_alarm_action(cw_actions.SnsAction(alert_topic))
        dlq_alarm.add_ok_action(cw_actions.SnsAction(alert_topic))

        # Error-rate alarm on the Lambda itself (catches all-throws, not just
        # DLQ drops which only fire after retries are exhausted). Threshold 0
        # ── Appointment completion sweeper ──────────────────────
        # The only thing in the platform triggered by the *absence* of an
        # action: an appointment whose slot has passed with nobody saying
        # whether the work happened. No HTTP request can observe that, so it
        # needs a schedule.
        #
        # The garage dashboard also shows an in-app prompt for the same
        # condition, computed live — that one needs no schedule and is the
        # primary channel. This Lambda is the out-of-band nudge, and it is what
        # stamps `completionPromptedAt` so the email goes out exactly once.
        self.completion_sweeper_fn = lambda_.Function(
            self, "CompletionSweeperFn",
            function_name="nextservice-appointment-completion-sweeper",
            description="Asks garages to confirm appointments whose slot has passed",
            runtime=lambda_.Runtime.NODEJS_20_X,
            handler="index.handler",
            code=lambda_.Code.from_asset("lambdas/appointment-completion-sweeper"),
            memory_size=256,
            timeout=Duration.minutes(5),
            environment={
                "SES_FROM_ADDRESS": ses_from_address,
                "SES_CONFIG_SET": SES_CONFIG_SET_NAME,
                "APP_URL": app_url,
                "SERVICE_REQUESTS_TABLE": "ServiceRequests",
                "GARAGES_TABLE": "Garages",
                "EMAIL_LOGS_TABLE": "EmailLogs",
                "NOTIFICATIONS_ENABLED": str(notifications_enabled).lower(),
                # Keep in step with COMPLETION_GRACE_HOURS in
                # src/types/reviews.ts — the in-app prompt uses that constant,
                # and the two must agree or the email arrives before the badge.
                "COMPLETION_GRACE_HOURS": "4",
                "COMPLETION_MAX_AGE_DAYS": "30",
            },
        )

        # Query StatusIndex, read the request, stamp completionPromptedAt.
        self.completion_sweeper_fn.add_to_role_policy(
            iam.PolicyStatement(
                sid="ReadAndStampServiceRequests",
                actions=["dynamodb:Query", "dynamodb:GetItem", "dynamodb:UpdateItem"],
                resources=[
                    service_requests_table_arn,
                    f"{service_requests_table_arn}/index/*",
                ],
            )
        )
        self.completion_sweeper_fn.add_to_role_policy(
            iam.PolicyStatement(
                sid="ReadGaragesForCompletionPrompt",
                actions=["dynamodb:GetItem"],
                resources=[garages_table_arn],
            )
        )
        self.completion_sweeper_fn.add_to_role_policy(
            iam.PolicyStatement(
                sid="WriteCompletionEmailLogs",
                actions=["dynamodb:PutItem", "dynamodb:UpdateItem"],
                resources=[
                    f"arn:aws:dynamodb:{self.region}:{self.account}:table/EmailLogs"
                ],
            )
        )
        # SES rejects the send unless BOTH the identity and the configuration
        # set are granted — same pairing as the broadcast Lambda above.
        self.completion_sweeper_fn.add_to_role_policy(
            iam.PolicyStatement(
                sid="SendCompletionPrompts",
                actions=["ses:SendRawEmail", "ses:SendEmail"],
                resources=[
                    f"arn:aws:ses:{self.region}:{self.account}:identity/*",
                    f"arn:aws:ses:{self.region}:{self.account}:configuration-set/{SES_CONFIG_SET_NAME}",
                ],
            )
        )

        # Hourly. The grace period is measured in hours, so anything finer just
        # re-reads the same rows; anything coarser delays the prompt past the
        # point where the garage still remembers the job.
        events.Rule(
            self, "CompletionSweeperSchedule",
            rule_name="nextservice-appointment-completion-sweeper",
            description="Hourly sweep for appointments awaiting the garage's confirmation",
            schedule=events.Schedule.rate(Duration.hours(1)),
            targets=[events_targets.LambdaFunction(self.completion_sweeper_fn)],
        )

        sweeper_error_alarm = cw.Alarm(
            self, "CompletionSweeperErrorsAlarm",
            alarm_name="NextService-CompletionSweeper-Errors",
            alarm_description="Completion sweeper Lambda threw at least once in 1h",
            metric=self.completion_sweeper_fn.metric_errors(
                period=Duration.hours(1),
                statistic="Sum",
            ),
            threshold=0,
            evaluation_periods=1,
            comparison_operator=cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treat_missing_data=cw.TreatMissingData.NOT_BREACHING,
        )
        sweeper_error_alarm.add_alarm_action(cw_actions.SnsAction(alert_topic))
        sweeper_error_alarm.add_ok_action(cw_actions.SnsAction(alert_topic))

        # — any single error fires the alarm, since email broadcasts are
        # business-critical and silent partial failures shouldn't go unnoticed.
        error_alarm = cw.Alarm(
            self, "BroadcastErrorsAlarm",
            alarm_name="NextService-BroadcastLambda-Errors",
            alarm_description="Broadcast Lambda threw at least once in 5min",
            metric=self.broadcast_fn.metric_errors(
                period=Duration.minutes(5),
                statistic="Sum",
            ),
            threshold=0,
            evaluation_periods=1,
            comparison_operator=cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treat_missing_data=cw.TreatMissingData.NOT_BREACHING,
        )
        error_alarm.add_alarm_action(cw_actions.SnsAction(alert_topic))
        error_alarm.add_ok_action(cw_actions.SnsAction(alert_topic))

        # Same coverage for the SES event processor Lambda. Without this, the
        # init-time SyntaxError that broke the entire delivery-event pipeline
        # in 2026-04 went undetected — emails kept being sent but never
        # transitioned past status="sent".
        processor_error_alarm = cw.Alarm(
            self, "SesProcessorErrorsAlarm",
            alarm_name="NextService-SesEventProcessor-Errors",
            alarm_description="SES event processor Lambda threw at least once in 5min",
            metric=self.ses_processor_fn.metric_errors(
                period=Duration.minutes(5),
                statistic="Sum",
            ),
            threshold=0,
            evaluation_periods=1,
            comparison_operator=cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treat_missing_data=cw.TreatMissingData.NOT_BREACHING,
        )
        processor_error_alarm.add_alarm_action(cw_actions.SnsAction(alert_topic))
        processor_error_alarm.add_ok_action(cw_actions.SnsAction(alert_topic))

        # ── SES reputation alarms ───────────────────────────────
        # AWS auto-pauses the SES account when Reputation.BounceRate > 10% or
        # Reputation.ComplaintRate > 0.5%. Alarm well below those so the
        # operator has time to investigate before the account goes dark.
        #
        # Metrics are account-wide per-region, emitted automatically by SES.
        # No Configuration Set required. Period is 15 min because SES
        # publishes these values infrequently.
        ses_bounce_alarm = cw.Alarm(
            self, "SESBounceRateAlarm",
            alarm_name="NextService-SES-BounceRate-High",
            alarm_description=(
                "SES bounce rate > 3% — investigate. "
                "AWS auto-pauses the account at 10%."
            ),
            metric=cw.Metric(
                namespace="AWS/SES",
                metric_name="Reputation.BounceRate",
                statistic="Average",
                period=Duration.minutes(15),
            ),
            threshold=0.03,  # 3%
            evaluation_periods=1,
            comparison_operator=cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treat_missing_data=cw.TreatMissingData.NOT_BREACHING,
        )
        ses_bounce_alarm.add_alarm_action(cw_actions.SnsAction(alert_topic))
        ses_bounce_alarm.add_ok_action(cw_actions.SnsAction(alert_topic))

        ses_complaint_alarm = cw.Alarm(
            self, "SESComplaintRateAlarm",
            alarm_name="NextService-SES-ComplaintRate-High",
            alarm_description=(
                "SES complaint rate > 0.1% — investigate. "
                "AWS auto-pauses the account at 0.5%."
            ),
            metric=cw.Metric(
                namespace="AWS/SES",
                metric_name="Reputation.ComplaintRate",
                statistic="Average",
                period=Duration.minutes(15),
            ),
            threshold=0.001,  # 0.1%
            evaluation_periods=1,
            comparison_operator=cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treat_missing_data=cw.TreatMissingData.NOT_BREACHING,
        )
        ses_complaint_alarm.add_alarm_action(cw_actions.SnsAction(alert_topic))
        ses_complaint_alarm.add_ok_action(cw_actions.SnsAction(alert_topic))

        # ── Outputs ─────────────────────────────────────────────
        CfnOutput(self, "BroadcastFunctionName",
                  value=self.broadcast_fn.function_name,
                  export_name="NextService-BroadcastFunctionName")
        CfnOutput(self, "BroadcastDLQArn",
                  value=self.dlq.queue_arn,
                  export_name="NextService-BroadcastDLQArn")
        CfnOutput(self, "SESConfigSetName",
                  value=SES_CONFIG_SET_NAME,
                  export_name="NextService-SESConfigSetName")
        CfnOutput(self, "SESEventsTopicArn",
                  value=ses_events_topic.topic_arn,
                  export_name="NextService-SESEventsTopicArn")
