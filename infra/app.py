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

# Email to receive alarm notifications (will get a confirmation email)
ALERT_EMAIL = "nmarianos93@gmail.com"

# GitHub repo (for Amplify auto-deploy)
GITHUB_OWNER = "Nick-X-Mar"
GITHUB_REPO = "nextService"
GITHUB_BRANCH = "dev"

# GitHub personal access token stored in AWS Secrets Manager
GITHUB_TOKEN_SECRET_NAME = "nextservice/github-token"

# ─────────────────────────────────────────────────────────────────

env = cdk.Environment(account=AWS_ACCOUNT, region=AWS_REGION)

app = cdk.App()

# 1. DynamoDB — 6 tables with GSIs
dynamo = DynamoDBStack(app, "NextService-DynamoDB", env=env)

# 2. S3 — photo uploads bucket
s3 = S3Stack(app, "NextService-S3", env=env)

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
    branch=GITHUB_BRANCH,
    s3_bucket_name=s3.uploads_bucket.bucket_name,
    appsync_http_endpoint=appsync.http_endpoint,
    appsync_realtime_endpoint=appsync.realtime_endpoint,
    appsync_api_key=appsync.api_key.attr_api_key,
    env=env,
)
amplify.add_dependency(s3)
amplify.add_dependency(appsync)
amplify.add_dependency(dynamo)

app.synth()
