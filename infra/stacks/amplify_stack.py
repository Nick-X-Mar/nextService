import textwrap

from aws_cdk import (
    CustomResource,
    Duration,
    Stack,
    CfnOutput,
    RemovalPolicy,
    SecretValue,
    aws_amplify as amplify,
    aws_iam as iam,
    aws_lambda as lambda_,
    custom_resources as cr,
)
from constructs import Construct


class AmplifyStack(Stack):
    """Amplify Hosting for the Next.js app, with env vars wired from other stacks."""

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        github_owner: str,
        github_repo: str,
        github_token_secret_name: str,
        auth_secrets_name: str,
        branch: str = "main",
        s3_bucket_name: str,
        appsync_http_endpoint: str,
        appsync_realtime_endpoint: str,
        appsync_api_key: str,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ── Auth secrets ────────────────────────────────────────
        # One Secrets Manager secret, JSON body: { JWT_SECRET, ADMIN_JWT_SECRET }.
        # A Lambda-backed custom resource creates it on first deploy with two
        # cryptographically random hex strings. Subsequent deploys are no-ops, so
        # rotations performed out-of-band (aws secretsmanager put-secret-value)
        # aren't clobbered. Deleting the stack deletes the secret.
        auth_secrets_fn = lambda_.Function(
            self, "AuthSecretsFn",
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler="index.handler",
            timeout=Duration.seconds(30),
            code=lambda_.Code.from_inline(textwrap.dedent('''
                import json, secrets, boto3
                sm = boto3.client("secretsmanager")
                def handler(event, context):
                    req = event["RequestType"]
                    name = event["ResourceProperties"]["SecretName"]
                    if req == "Create":
                        body = json.dumps({
                            "JWT_SECRET": secrets.token_hex(32),
                            "ADMIN_JWT_SECRET": secrets.token_hex(32),
                        })
                        try:
                            sm.create_secret(Name=name, SecretString=body,
                                             Description="NextService auth secrets (JWT + admin JWT)")
                        except sm.exceptions.ResourceExistsException:
                            # Already exists (prior deploy or out-of-band create). Leave as-is.
                            pass
                    elif req == "Delete":
                        try:
                            sm.delete_secret(SecretId=name,
                                             ForceDeleteWithoutRecovery=True)
                        except sm.exceptions.ResourceNotFoundException:
                            pass
                    # Update is a no-op — preserves out-of-band rotations.
                    return {"PhysicalResourceId": name}
            ''')),
        )
        auth_secrets_fn.add_to_role_policy(iam.PolicyStatement(
            actions=[
                "secretsmanager:CreateSecret",
                "secretsmanager:DeleteSecret",
                "secretsmanager:DescribeSecret",
            ],
            resources=["*"],
        ))

        auth_secrets_provider = cr.Provider(
            self, "AuthSecretsProvider",
            on_event_handler=auth_secrets_fn,
        )

        auth_secrets_cr = CustomResource(
            self, "AuthSecretsResource",
            service_token=auth_secrets_provider.service_token,
            resource_type="Custom::AuthSecretsGenerator",
            properties={"SecretName": auth_secrets_name},
            removal_policy=RemovalPolicy.DESTROY,
        )

        jwt_secret_value = SecretValue.secrets_manager(
            auth_secrets_name, json_field="JWT_SECRET",
        )
        admin_jwt_secret_value = SecretValue.secrets_manager(
            auth_secrets_name, json_field="ADMIN_JWT_SECRET",
        )

        # ── IAM Role for Amplify ────────────────────────────────
        self.amplify_role = iam.Role(
            self, "AmplifyRole",
            role_name="nextservice-amplify-role",
            assumed_by=iam.ServicePrincipal("amplify.amazonaws.com"),
        )

        # DynamoDB access — all tables + indexes
        table_names = [
            "Clients", "Garages", "Vehicles",
            "ServiceRequests", "Offers", "ChatMessages",
            "EventLogs", "EmailLogs", "AdminUsers",
            "Payments", "WalletTransactions", "HotDeals",
        ]
        dynamo_resources = []
        for t in table_names:
            dynamo_resources.append(
                f"arn:aws:dynamodb:{self.region}:{self.account}:table/{t}"
            )
            dynamo_resources.append(
                f"arn:aws:dynamodb:{self.region}:{self.account}:table/{t}/index/*"
            )

        self.amplify_role.add_to_policy(iam.PolicyStatement(
            sid="DynamoDBAccess",
            actions=[
                "dynamodb:GetItem",
                "dynamodb:PutItem",
                "dynamodb:UpdateItem",
                "dynamodb:DeleteItem",
                "dynamodb:Query",
                "dynamodb:Scan",
                "dynamodb:BatchGetItem",
                "dynamodb:BatchWriteItem",
            ],
            resources=dynamo_resources,
        ))

        # DynamoDB — create/describe for auto-provisioned tables
        self.amplify_role.add_to_policy(iam.PolicyStatement(
            sid="DynamoDBCreateTable",
            actions=[
                "dynamodb:CreateTable",
                "dynamodb:DescribeTable",
                "dynamodb:UpdateTimeToLive",
                "dynamodb:DescribeTimeToLive",
            ],
            resources=[
                f"arn:aws:dynamodb:{self.region}:{self.account}:table/EventLogs",
                f"arn:aws:dynamodb:{self.region}:{self.account}:table/EmailLogs",
                f"arn:aws:dynamodb:{self.region}:{self.account}:table/AdminUsers",
                f"arn:aws:dynamodb:{self.region}:{self.account}:table/Payments",
                f"arn:aws:dynamodb:{self.region}:{self.account}:table/WalletTransactions",
                f"arn:aws:dynamodb:{self.region}:{self.account}:table/HotDeals",
            ],
        ))

        # S3 access — wildcard so one role works across envs (staging/production/...)
        self.amplify_role.add_to_policy(iam.PolicyStatement(
            sid="S3Access",
            actions=[
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject",
                "s3:ListBucket",
            ],
            resources=[
                "arn:aws:s3:::nextservice-uploads-*",
                "arn:aws:s3:::nextservice-uploads-*/*",
            ],
        ))

        # AppSync access
        self.amplify_role.add_to_policy(iam.PolicyStatement(
            sid="AppSyncAccess",
            actions=[
                "appsync:GraphQL",
                "appsync:Connect",
            ],
            resources=[
                f"arn:aws:appsync:{self.region}:{self.account}:apis/*",
            ],
        ))

        # CloudWatch Logs
        self.amplify_role.add_to_policy(iam.PolicyStatement(
            sid="CloudWatchLogs",
            actions=[
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents",
                "logs:DescribeLogGroups",
                "logs:DescribeLogStreams",
                "logs:FilterLogEvents",
                "logs:GetLogEvents",
            ],
            resources=[
                f"arn:aws:logs:{self.region}:{self.account}:log-group:/nextservice/*",
                f"arn:aws:logs:{self.region}:{self.account}:log-group:/nextservice/*:*",
            ],
        ))

        # CloudWatch Metrics — for admin error monitoring dashboard
        self.amplify_role.add_to_policy(iam.PolicyStatement(
            sid="CloudWatchMetrics",
            actions=[
                "cloudwatch:GetMetricData",
                "cloudwatch:GetMetricStatistics",
                "cloudwatch:ListMetrics",
            ],
            resources=["*"],
        ))

        # SES — send emails
        self.amplify_role.add_to_policy(iam.PolicyStatement(
            sid="SESSendEmail",
            actions=[
                "ses:SendEmail",
                "ses:SendRawEmail",
            ],
            resources=[
                f"arn:aws:ses:{self.region}:{self.account}:identity/*",
            ],
        ))

        # SNS publish (for future notification service)
        self.amplify_role.add_to_policy(iam.PolicyStatement(
            sid="SNSPublish",
            actions=["sns:Publish"],
            resources=[
                f"arn:aws:sns:{self.region}:{self.account}:*",
            ],
        ))

        # ── Amplify App (L1 CfnApp) ────────────────────────────
        github_token = SecretValue.secrets_manager(github_token_secret_name)

        self.amplify_app = amplify.CfnApp(
            self, "NextServiceApp",
            name="nextservice-web",
            repository=f"https://github.com/{github_owner}/{github_repo}",
            access_token=github_token.unsafe_unwrap(),
            iam_service_role=self.amplify_role.role_arn,
            platform="WEB_COMPUTE",
            build_spec="""version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
      - .next/cache/**/*
""",
            environment_variables=[
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="REGION", value=self.region,
                ),
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="S3_BUCKET_NAME", value=s3_bucket_name,
                ),
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="NEXT_PUBLIC_APPSYNC_REGION", value=self.region,
                ),
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="NEXT_PUBLIC_APPSYNC_GRAPHQL_ENDPOINT",
                    value=appsync_http_endpoint,
                ),
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="NEXT_PUBLIC_APPSYNC_WEBSOCKET_ENDPOINT",
                    value=appsync_realtime_endpoint,
                ),
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="NEXT_PUBLIC_APPSYNC_API_KEY",
                    value=appsync_api_key,
                ),
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="AMPLIFY_ROLE_ARN",
                    value=self.amplify_role.role_arn,
                ),
                # Notifications (email via SES)
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="NOTIFICATIONS_ENABLED", value="true",
                ),
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="SES_FROM_ADDRESS", value="no-reply@nextservice.gr",
                ),
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="SES_REGION", value=self.region,
                ),
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="ADMIN_EMAIL", value="nmarianos93@gmail.com",
                ),
                # Auth — resolved from Secrets Manager at deploy time
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="JWT_SECRET",
                    value=jwt_secret_value.unsafe_unwrap(),
                ),
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="SESSION_EXPIRY", value="2d",
                ),
                # Admin Dashboard
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="ADMIN_JWT_SECRET",
                    value=admin_jwt_secret_value.unsafe_unwrap(),
                ),
                amplify.CfnApp.EnvironmentVariableProperty(
                    name="ADMIN_SESSION_EXPIRY", value="8h",
                ),
            ],
        )
        # Amplify env vars resolve `{{resolve:secretsmanager:...}}` at deploy
        # time, so the secret must exist before the app is created/updated.
        self.amplify_app.node.add_dependency(auth_secrets_cr)

        # ── Branch ──────────────────────────────────────────────
        self.main_branch = amplify.CfnBranch(
            self, "MainBranch",
            app_id=self.amplify_app.attr_app_id,
            branch_name=branch,
            stage="PRODUCTION",
            enable_auto_build=True,
        )

        # ── Outputs ─────────────────────────────────────────────
        CfnOutput(self, "AmplifyAppId",
                  value=self.amplify_app.attr_app_id,
                  export_name="NextService-AmplifyAppId")
        CfnOutput(self, "AmplifyAppUrl",
                  value=f"https://{branch}.{self.amplify_app.attr_default_domain}",
                  export_name="NextService-AmplifyAppUrl")
        CfnOutput(self, "AmplifyRoleArn",
                  value=self.amplify_role.role_arn,
                  export_name="NextService-AmplifyRoleArn")
