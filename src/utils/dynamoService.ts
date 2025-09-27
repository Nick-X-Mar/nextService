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
    const config: {
      region: string
      credentials?: {
        accessKeyId: string
        secretAccessKey: string
      }
    } = {
      region: process.env.REGION || 'eu-central-1'
    }

    // Only add credentials if they are provided (for IAM role, don't add credentials)
    if (process.env.ACCESS_KEY_ID && process.env.SECRET_ACCESS_KEY) {
      config.credentials = {
        accessKeyId: process.env.ACCESS_KEY_ID,
        secretAccessKey: process.env.SECRET_ACCESS_KEY
      }
    }
    // If no credentials are provided, AWS SDK will use IAM role or default credential chain

    return config
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
    region: process.env.REGION || 'eu-central-1',
    s3Bucket: process.env.S3_BUCKET_NAME || 'nextservice-uploads-staging'
  }
}

// Log environment info (useful for debugging)
console.log('🔧 DynamoDB Environment:', getEnvironmentInfo())
console.log('🔧 REGION:', process.env.REGION || 'NOT SET')
console.log('🔧 ACCESS_KEY_ID:', process.env.ACCESS_KEY_ID ? 'SET' : 'NOT SET')
console.log('🔧 SECRET_ACCESS_KEY:', process.env.SECRET_ACCESS_KEY ? 'SET' : 'NOT SET')
console.log('🔧 NODE_ENV:', process.env.NODE_ENV)
console.log('🔧 DYNAMODB_ENDPOINT:', process.env.DYNAMODB_ENDPOINT || 'NOT SET')
