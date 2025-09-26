# Environment Setup Guide

## Required Environment Variables

Create a `.env.local` file in your project root with the following variables:

```bash
# AWS Configuration
# Get these values from the AWS setup script output
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_REGION=eu-central-1

# S3 Configuration
S3_BUCKET_NAME=nextservice-uploads-staging

# DynamoDB Configuration (for local development)
DYNAMODB_ENDPOINT=http://localhost:8000

# SMS Configuration (AWS SNS)
# These are the same as AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
# SNS_REGION=eu-west-1

# Next.js Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret_here

# Optional: For production
# NODE_ENV=production
```

## AWS Amplify Environment Variables

When deploying to AWS Amplify, add these environment variables in the Amplify console:

1. Go to your Amplify app in the AWS Console
2. Navigate to "Environment variables" in the left sidebar
3. Add the following variables:

| Variable Name | Value | Description |
|---------------|-------|-------------|
| `AWS_ACCESS_KEY_ID` | `your_access_key_here` | IAM user access key |
| `AWS_SECRET_ACCESS_KEY` | `your_secret_key_here` | IAM user secret key |
| `AWS_REGION` | `eu-west-1` | AWS region |
| `S3_BUCKET_NAME` | `nextservice-uploads` | S3 bucket name |
| `NEXTAUTH_URL` | `https://your-app.amplifyapp.com` | Your Amplify app URL |
| `NEXTAUTH_SECRET` | `your_nextauth_secret_here` | Random secret for NextAuth |

## Security Notes

- Never commit `.env.local` to version control
- Use different AWS credentials for development and production
- Rotate access keys regularly
- Use IAM roles instead of access keys when possible in production

## Local Development

For local development with DynamoDB Local:

1. Start DynamoDB Local: `java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -sharedDb -port 8000`
2. Set `DYNAMODB_ENDPOINT=http://localhost:8000` in your environment
3. Use the same AWS credentials for both local and cloud resources
