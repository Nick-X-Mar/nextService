#!/bin/bash
# Wrapper that uses the project-local AWS credentials and falls back to npx
# when `cdk` isn't installed globally.
export AWS_SHARED_CREDENTIALS_FILE="$(dirname "$0")/../.aws/credentials"
if command -v cdk >/dev/null 2>&1; then
  exec cdk "$@"
else
  exec npx --yes aws-cdk "$@"
fi
