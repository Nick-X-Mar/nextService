#!/usr/bin/env python3
"""
NextService AWS CDK App
=======================
Deploys all infrastructure for the NextService platform:
  - DynamoDB tables (6 tables with GSIs)
  - S3 bucket for photo uploads
  - AppSync Events API for real-time chat
  - CloudWatch monitoring + SNS email alerts
  - Amplify Hosting (Next.js SSR)

Usage:
  cd infra
  python3 -m venv .venv
  source .venv/bin/activate
  pip install -r requirements.txt
  cdk bootstrap                    # first time only
  cdk synth                        # preview CloudFormation
  cdk deploy --all                 # deploy everything
  cdk deploy NextService-DynamoDB  # deploy single stack

Prerequisites:
  1. AWS CLI configured with the new account credentials
  2. GitHub token stored in Secrets Manager (see below)
  3. Node.js + npm (for CDK CLI): npm install -g aws-cdk

Store GitHub token before deploying Amplify:
  aws secretsmanager create-secret \\
    --name nextservice/github-token \\
    --secret-string "ghp_your_token_here" \\
    --region eu-central-1
"""

import aws_cdk as cdk
from stacks.dynamodb_stack import DynamoDBStack
from stacks.s3_stack import S3Stack
from stacks.appsync_stack import AppSyncStack
from stacks.monitoring_stack import MonitoringStack
from stacks.amplify_stack import AmplifyStack

# ─────────────────────────────────────────────────────────────────
# CONFIGURATION — edit these values for your deployment
# ─────────────────────────────────────────────────────────────────
AWS_ACCOUNT = "766671488262"
AWS_REGION = "eu-central-1"

# Deployment stage — used as suffix for environment-scoped resources
# (e.g. S3 bucket `nextservice-uploads-{STAGE}`). Override via `cdk deploy -c stage=production`.
STAGE = "staging"

# Email to receive alarm notifications (will get a confirmation email)
ALERT_EMAIL = "nmarianos93@gmail.com"

# GitHub repo (for Amplify auto-deploy)
GITHUB_OWNER = "Nick-X-Mar"
GITHUB_REPO = "nextService"
GITHUB_BRANCH = "dev"

# GitHub personal access token stored in AWS Secrets Manager
GITHUB_TOKEN_SECRET_NAME = "nextservice/github-token"

# Auth secrets stored in AWS Secrets Manager.
# JSON body with fields: JWT_SECRET, ADMIN_JWT_SECRET.
# Create once (see `aws secretsmanager create-secret` example in the infra README).
AUTH_SECRETS_NAME = "nextservice/auth-secrets"

# ─────────────────────────────────────────────────────────────────

env = cdk.Environment(account=AWS_ACCOUNT, region=AWS_REGION)

app = cdk.App()

# Allow `cdk deploy -c stage=production` to override the default
stage = app.node.try_get_context("stage") or STAGE

# Bucket name is computed once here and passed to both stacks as a plain string
# (no CFN Fn::ImportValue), so changing it later doesn't block updates across
# stacks — see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-stack-exports.html
s3_bucket_name = f"nextservice-uploads-{AWS_ACCOUNT}-{stage}"

# 1. DynamoDB — 6 tables with GSIs
dynamo = DynamoDBStack(app, "NextService-DynamoDB", env=env)

# 2. S3 — photo uploads bucket
s3 = S3Stack(app, "NextService-S3", bucket_name=s3_bucket_name, env=env)

# 3. AppSync Events — real-time chat
appsync = AppSyncStack(app, "NextService-AppSync", env=env)

# 4. Monitoring — CloudWatch logs, alarms, SNS email alerts
monitoring = MonitoringStack(
    app, "NextService-Monitoring",
    alert_email=ALERT_EMAIL,
    env=env,
)

# 5. Amplify Hosting — Next.js SSR with env vars from other stacks
# AppSync attr_dns is a list: [http_endpoint, realtime_endpoint]
amplify = AmplifyStack(
    app, "NextService-Amplify",
    github_owner=GITHUB_OWNER,
    github_repo=GITHUB_REPO,
    github_token_secret_name=GITHUB_TOKEN_SECRET_NAME,
    auth_secrets_name=AUTH_SECRETS_NAME,
    branch=GITHUB_BRANCH,
    s3_bucket_name=s3_bucket_name,
    appsync_http_endpoint=appsync.http_endpoint,
    appsync_realtime_endpoint=appsync.realtime_endpoint,
    appsync_api_key=appsync.api_key.attr_api_key,
    env=env,
)
# Amplify no longer imports anything from the S3 stack (bucket name is passed
# as a plain string), so the hard dependency is removed — this lets us deploy
# them independently and avoid cross-stack export/import ordering headaches.
amplify.add_dependency(appsync)
amplify.add_dependency(dynamo)

app.synth()
