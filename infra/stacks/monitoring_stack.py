from aws_cdk import (
    Stack,
    CfnOutput,
    Duration,
    aws_cloudwatch as cw,
    aws_cloudwatch_actions as cw_actions,
    aws_logs as logs,
    aws_sns as sns,
    aws_sns_subscriptions as subs,
)
from constructs import Construct


class MonitoringStack(Stack):
    """CloudWatch logs, SNS alerts, and alarms for 4xx/5xx errors."""

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        alert_email: str,
        amplify_app_id: str = "",
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ── SNS Topic for alerts ────────────────────────────────
        self.alert_topic = sns.Topic(
            self, "AlertTopic",
            topic_name="nextservice-alerts",
            display_name="NextService Alerts",
        )
        self.alert_topic.add_subscription(
            subs.EmailSubscription(alert_email)
        )

        # ── CloudWatch Log Groups ───────────────────────────────
        self.app_log_group = logs.LogGroup(
            self, "AppLogGroup",
            log_group_name="/nextservice/app",
            retention=logs.RetentionDays.ONE_MONTH,
        )

        self.api_log_group = logs.LogGroup(
            self, "ApiLogGroup",
            log_group_name="/nextservice/api",
            retention=logs.RetentionDays.ONE_MONTH,
        )

        # ── Metric Filters ──────────────────────────────────────
        # The app writes one JSON entry per warning/error into /nextservice/app
        # (src/utils/logger.ts): `level` is "error" | "warn", and the per-request
        # line carries `type: "api_request"` and `statusCode`.
        # Every logged error — a 5xx, a handler's caught exception, a crashed render
        filter_5xx = logs.MetricFilter(
            self, "5xxFilter",
            log_group=self.app_log_group,
            filter_pattern=logs.FilterPattern.string_value("$.level", "=", "error"),
            metric_name="5xxErrors",
            metric_namespace="NextService",
            metric_value="1",
            default_value=0,
        )

        # 4xx answers (401s are not logged as warnings)
        filter_4xx = logs.MetricFilter(
            self, "4xxFilter",
            log_group=self.app_log_group,
            filter_pattern=logs.FilterPattern.all(
                logs.FilterPattern.string_value("$.type", "=", "api_request"),
                logs.FilterPattern.number_value("$.statusCode", ">=", 400),
                logs.FilterPattern.number_value("$.statusCode", "<", 500),
            ),
            metric_name="4xxErrors",
            metric_namespace="NextService",
            metric_value="1",
            default_value=0,
        )

        # ── Alarms ──────────────────────────────────────────────
        alarm_5xx = cw.Alarm(
            self, "5xxAlarm",
            alarm_name="NextService-5xx-Errors",
            alarm_description="At least one server error logged in 5 minutes",
            metric=cw.Metric(
                namespace="NextService",
                metric_name="5xxErrors",
                statistic="Sum",
                period=Duration.minutes(5),
            ),
            threshold=0,
            evaluation_periods=1,
            comparison_operator=cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treat_missing_data=cw.TreatMissingData.NOT_BREACHING,
        )
        alarm_5xx.add_alarm_action(cw_actions.SnsAction(self.alert_topic))
        alarm_5xx.add_ok_action(cw_actions.SnsAction(self.alert_topic))

        alarm_4xx = cw.Alarm(
            self, "4xxAlarm",
            alarm_name="NextService-4xx-Errors",
            alarm_description="4xx errors > 50 in 5 minutes",
            metric=cw.Metric(
                namespace="NextService",
                metric_name="4xxErrors",
                statistic="Sum",
                period=Duration.minutes(5),
            ),
            threshold=50,
            evaluation_periods=1,
            comparison_operator=cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treat_missing_data=cw.TreatMissingData.NOT_BREACHING,
        )
        alarm_4xx.add_alarm_action(cw_actions.SnsAction(self.alert_topic))
        alarm_4xx.add_ok_action(cw_actions.SnsAction(self.alert_topic))

        # ── Dashboard ───────────────────────────────────────────
        dashboard = cw.Dashboard(
            self, "NextServiceDashboard",
            dashboard_name="NextService-Overview",
        )
        dashboard.add_widgets(
            cw.GraphWidget(
                title="5xx Errors",
                left=[cw.Metric(
                    namespace="NextService",
                    metric_name="5xxErrors",
                    statistic="Sum",
                    period=Duration.minutes(5),
                )],
                width=12,
            ),
            cw.GraphWidget(
                title="4xx Errors",
                left=[cw.Metric(
                    namespace="NextService",
                    metric_name="4xxErrors",
                    statistic="Sum",
                    period=Duration.minutes(5),
                )],
                width=12,
            ),
        )

        # ── Outputs ─────────────────────────────────────────────
        CfnOutput(self, "AlertTopicArn",
                  value=self.alert_topic.topic_arn,
                  export_name="NextService-AlertTopicArn")
        CfnOutput(self, "AppLogGroupName",
                  value=self.app_log_group.log_group_name,
                  export_name="NextService-AppLogGroupName")
        CfnOutput(self, "DashboardName",
                  value=dashboard.dashboard_name,
                  export_name="NextService-DashboardName")
