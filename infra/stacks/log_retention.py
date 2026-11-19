"""How long CloudWatch keeps NextService's logs.

The privacy policy promises that technical logs are deleted automatically after
this long («Τεχνικά αρχεία λειτουργίας: 30 ημέρες», src/data/content/pages.ts),
so every log group we write to must carry it. Change the two together.
"""
from aws_cdk import (
    aws_lambda as lambda_,
    aws_logs as logs,
)
from constructs import Construct

LOG_RETENTION = logs.RetentionDays.ONE_MONTH


def expire_logs(scope: Construct, construct_id: str, log_group_name: str) -> None:
    """Put LOG_RETENTION on a log group that AWS creates by itself rather than
    CDK, such as Amplify's `/aws/amplify/<appId>`. The group is created if it
    doesn't exist yet and is never deleted with the stack."""
    logs.LogRetention(
        scope, construct_id,
        log_group_name=log_group_name,
        retention=LOG_RETENTION,
    )


def expire_lambda_logs(fn: lambda_.Function) -> None:
    """The same for a Lambda's own `/aws/lambda/<name>` group, which Lambda
    makes on the first invocation with no retention at all. Keeping the name
    matters: /admin/errors (src/utils/errorGroups.ts) reads these groups by it."""
    expire_logs(fn, "LogRetention", f"/aws/lambda/{fn.function_name}")
