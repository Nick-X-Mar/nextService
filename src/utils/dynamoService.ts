import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

// Environment-aware DynamoDB configuration
const getDynamoDBConfig = () => {
  const isLocal = process.env.NODE_ENV === 'development' && process.env.DYNAMODB_ENDPOINT
  
  if (isLocal) {
    // Local DynamoDB configuration
    return {
      region: 'localhost',
      endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
      credentials: {
        accessKeyId: 'dummy',
        secretAccessKey: 'dummy'
      }
    }
  } else {
    // AWS DynamoDB configuration
    return {
      region: process.env.AWS_REGION || 'eu-central-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
      }
    }
  }
}

// Create DynamoDB client
const dynamoDBClient = new DynamoDBClient(getDynamoDBConfig())
export const dynamoDB = DynamoDBDocumentClient.from(dynamoDBClient)

// Helper function to check if using local DynamoDB
export const isLocalDynamoDB = (): boolean => {
  return process.env.NODE_ENV === 'development' && !!process.env.DYNAMODB_ENDPOINT
}

// Helper function to get current environment info
export const getEnvironmentInfo = () => {
  return {
    isLocal: isLocalDynamoDB(),
    dynamoDBEndpoint: isLocalDynamoDB() ? process.env.DYNAMODB_ENDPOINT : 'AWS DynamoDB',
    region: process.env.AWS_REGION || 'eu-central-1',
    s3Bucket: process.env.S3_BUCKET_NAME || 'nextservice-uploads-staging'
  }
}

// Log environment info (useful for debugging)
if (process.env.NODE_ENV === 'development') {
  console.log('🔧 DynamoDB Environment:', getEnvironmentInfo())
}
