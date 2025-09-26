# Environment Configuration Guide

## Local Development (.env.local)

Create a `.env.local` file in your project root:

```bash
# ===========================================
# AWS Configuration (for S3 and production)
# ===========================================
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_REGION=eu-central-1

# ===========================================
# S3 Configuration (both local and production)
# ===========================================
S3_BUCKET_NAME=nextservice-uploads-staging

# ===========================================
# DynamoDB Configuration
# ===========================================
# For local development - use local DynamoDB
DYNAMODB_ENDPOINT=http://localhost:8000

# ===========================================
# SMS Configuration (AWS SNS)
# ===========================================
# Uses same AWS credentials as above

# ===========================================
# Next.js Configuration
# ===========================================
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret_here

# ===========================================
# Environment Detection
# ===========================================
NODE_ENV=development
```

## Production (AWS Amplify)

In AWS Amplify console, add these environment variables:

```bash
# AWS Configuration
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_REGION=eu-central-1

# S3 Configuration
S3_BUCKET_NAME=nextservice-uploads-staging

# DynamoDB Configuration
# Leave DYNAMODB_ENDPOINT empty to use AWS DynamoDB

# Next.js Configuration
NEXTAUTH_URL=https://your-app.amplifyapp.com
NEXTAUTH_SECRET=your_nextauth_secret_here

# Environment Detection
NODE_ENV=production
```

## How It Works

### Local Development
- ✅ **S3**: Uses AWS S3 (`nextservice-uploads-staging` bucket)
- ✅ **DynamoDB**: Uses local DynamoDB (`http://localhost:8000`)
- ✅ **SMS**: Uses AWS SNS

### Production (Amplify)
- ✅ **S3**: Uses AWS S3 (`nextservice-uploads-staging` bucket)
- ✅ **DynamoDB**: Uses AWS DynamoDB (no endpoint specified)
- ✅ **SMS**: Uses AWS SNS

## Environment Detection

The app automatically detects the environment:

```typescript
// Local development
if (process.env.NODE_ENV === 'development' && process.env.DYNAMODB_ENDPOINT) {
  // Use local DynamoDB
} else {
  // Use AWS DynamoDB
}
```

## Benefits

- ✅ **Same S3 bucket** for both environments
- ✅ **Local DynamoDB** for development (fast, free)
- ✅ **AWS DynamoDB** for production (scalable, managed)
- ✅ **Same AWS credentials** for S3 and SNS
- ✅ **Automatic environment detection**
