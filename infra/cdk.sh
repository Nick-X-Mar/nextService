#!/bin/bash
# Wrapper that uses the project-local AWS credentials
export AWS_SHARED_CREDENTIALS_FILE="$(dirname "$0")/../.aws/credentials"
exec cdk "$@"
