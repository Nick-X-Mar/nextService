#!/usr/bin/env python3
"""
NextService AWS CDK App
=======================
Deploys all infrastructure for the NextService platform:
  - DynamoDB tables (16 tables with GSIs)
  - S3 bucket for photo uploads
  - AppSync Events API for real-time chat
  - CloudWatch monitoring + SNS email alerts
  - Amplify Hosting (Next.js SSR)
  - Route 53 zone of nextservice.gr (production stage only)

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

Stages (see STAGES below): staging is the default; production is opt-in:
  cdk deploy --all                          # staging   (eu-central-1)
  cdk deploy --all -c stage=production      # production (eu-south-1)

Store GitHub token before deploying Amplify, once per stage's region:
  aws secretsmanager create-secret \\
    --name nextservice/github-token \\
    --secret-string "ghp_your_token_here" \\
    --region <the stage's region>
"""

import aws_cdk as cdk
from stacks.dynamodb_stack import DynamoDBStack
from stacks.s3_stack import S3Stack
from stacks.appsync_stack import AppSyncStack, REALTIME_SECRET_NAME
from stacks.monitoring_stack import MonitoringStack
from stacks.amplify_stack import AmplifyStack
from stacks.notifications_stack import NotificationsStack
from stacks.dns_stack import DnsStack

# ─────────────────────────────────────────────────────────────────
# CONFIGURATION — edit these values for your deployment
# ─────────────────────────────────────────────────────────────────
AWS_ACCOUNT = "766671488262"

# Email to receive alarm notifications (will get a confirmation email)
ALERT_EMAIL = "nmarianos93@gmail.com"

# GitHub repo (for Amplify auto-deploy)
GITHUB_OWNER = "Nick-X-Mar"
GITHUB_REPO = "nextService"

# GitHub personal access token stored in AWS Secrets Manager — one copy per
# region, since a secret is regional.
GITHUB_TOKEN_SECRET_NAME = "nextservice/github-token"

# Auth secrets stored in AWS Secrets Manager.
# JSON body with fields: JWT_SECRET, ADMIN_JWT_SECRET. The Amplify stack
# generates it on its first deploy in a region, so each stage gets its own.
AUTH_SECRETS_NAME = "nextservice/auth-secrets"

# One entry per environment. Each stage lives in its own region, which is what
# keeps them apart: table, function, topic and secret names are regional, so
# the two stages share the same literal names (`Clients`, `ServiceRequests`, …)
# and a production server physically cannot reach staging data. Only IAM role
# names are account-global, hence `amplify_role_name`.
#
#   region      — production is Milan: measured from Greece it is the closest
#                 region with Amplify (31 ms vs 54 ms for Frankfurt).
#   branch      — the GitHub branch Amplify builds on push.
#   site_url    — public origin for SEO (canonical URLs, OG tags, sitemap,
#                 robots, JSON-LD) and every link the app emails. Must match
#                 the URL users and Google actually hit. `None` until the
#                 Amplify app exists: the app then uses its own default domain,
#                 and the Notifications stack (whose emails need a literal
#                 origin) is skipped until the URL is written in here.
#   manage_ses_identity — whether the Notifications stack owns the SES domain
#                 identity. Staging's predates the stacks and was verified by
#                 hand; creating it again would fail as "already exists".
STAGES = {
    "staging": {
        "region": "eu-central-1",
        "branch": "dev",
        "site_url": "https://dev.d3ku6yajf4j6y8.amplifyapp.com",
        "amplify_role_name": "nextservice-amplify-role",
        "manage_ses_identity": False,
    },
    "production": {
        "region": "eu-south-1",
        "branch": "production",
        "site_url": "https://production.d22r1orgditcqx.amplifyapp.com",
        "amplify_role_name": "nextservice-amplify-role-production",
        "manage_ses_identity": True,
    },
}

# ─────────────────────────────────────────────────────────────────

app = cdk.App()

# `cdk deploy --all` targets staging; production needs `-c stage=production`
# on purpose, so a bare command can never touch it.
stage = app.node.try_get_context("stage") or "staging"
if stage not in STAGES:
    raise ValueError(f"Unknown stage {stage!r} — expected one of {sorted(STAGES)}")
config = STAGES[stage]

env = cdk.Environment(account=AWS_ACCOUNT, region=config["region"])

# When cutting over to the real domain, change site_url + branch together.
# Override per-deploy via: `cdk deploy -c site_url=https://...`
site_url = app.node.try_get_context("site_url") or config["site_url"]
# Origin of the CTA links in the Lambda-sent emails (new-request broadcast,
# completion reminder). It follows site_url so the app's emails and the
# Lambdas' never point at different sites — before the cutover
# `nextservice.gr` is still the old WordPress site, where these links 404.
# Override only on purpose: `cdk deploy -c app_url=https://...`
app_url = app.node.try_get_context("app_url") or site_url

# Bucket name is computed once here and passed to both stacks as a plain string
# (no CFN Fn::ImportValue), so changing it later doesn't block updates across
# stacks — see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-stack-exports.html
s3_bucket_name = f"nextservice-uploads-{AWS_ACCOUNT}-{stage}"

# 1. DynamoDB — every table, with GSIs, PITR and deletion protection
dynamo = DynamoDBStack(app, "NextService-DynamoDB", env=env)

# 2. S3 — photo uploads bucket
s3 = S3Stack(app, "NextService-S3", bucket_name=s3_bucket_name, env=env)

# 3. Monitoring — CloudWatch logs, alarms, SNS email alerts.
# Created before AppSync so the key-rotator Lambda can wire its error alarm
# into the shared alert topic.
monitoring = MonitoringStack(
    app, "NextService-Monitoring",
    alert_email=ALERT_EMAIL,
    env=env,
)

# 4. AppSync Events — real-time chat + self-rotating API key
appsync = AppSyncStack(
    app, "NextService-AppSync",
    alert_topic=monitoring.alert_topic,
    env=env,
)
appsync.add_dependency(monitoring)

# 5. Amplify Hosting — Next.js SSR with env vars from other stacks
# AppSync endpoints are the Events API's Dns.Http / Dns.Realtime attributes.
amplify = AmplifyStack(
    app, "NextService-Amplify",
    github_owner=GITHUB_OWNER,
    github_repo=GITHUB_REPO,
    github_token_secret_name=GITHUB_TOKEN_SECRET_NAME,
    auth_secrets_name=AUTH_SECRETS_NAME,
    branch=config["branch"],
    role_name=config["amplify_role_name"],
    s3_bucket_name=s3_bucket_name,
    site_url=site_url,
    appsync_http_endpoint=appsync.http_endpoint,
    appsync_realtime_endpoint=appsync.realtime_endpoint,
    appsync_api_key=appsync.api_key.attr_api_key,
    appsync_api_id=appsync.events_api.attr_api_id,
    realtime_secret_name=REALTIME_SECRET_NAME,
    env=env,
)
# Amplify no longer imports anything from the S3 stack (bucket name is passed
# as a plain string), so the hard dependency is removed — this lets us deploy
# them independently and avoid cross-stack export/import ordering headaches.
amplify.add_dependency(appsync)
amplify.add_dependency(dynamo)

# 6. Notifications — DynamoDB Streams → Lambda → SES broadcast
# The Next.js API route just writes the request to DynamoDB; this stack
# handles fan-out to every active garage, completely out-of-band.
# Skipped while site_url is unknown (first production deploy): its emails
# carry links, and a link to nowhere is worse than no email yet.
if app_url:
    notifications = NotificationsStack(
        app, "NextService-Notifications",
        service_requests_stream_arn=dynamo.service_requests_table.table_stream_arn,
        # The completion sweeper queries StatusIndex and stamps the row, so it
        # needs the table itself, not just the stream.
        service_requests_table_arn=dynamo.service_requests_table.table_arn,
        garages_table_arn=dynamo.garages_table.table_arn,
        alert_topic=monitoring.alert_topic,
        app_url=app_url,
        notifications_enabled=True,
        manage_ses_identity=config["manage_ses_identity"],
        env=env,
    )
    notifications.add_dependency(dynamo)
    notifications.add_dependency(monitoring)

# 7. DNS — the nextservice.gr zone (Route 53). One zone serves both stages
# (it carries each region's SES DKIM records), so it is deployed with
# production only: a bare `cdk deploy --all` must never touch live DNS.
if stage == "production":
    DnsStack(app, "NextService-DNS", termination_protection=True, env=env)

app.synth()
