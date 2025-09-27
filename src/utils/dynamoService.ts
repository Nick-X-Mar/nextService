import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { fromIni } from '@aws-sdk/credential-provider-ini'
import path from 'path'

// Helper to load shared-credentials file in local dev
const loadLocalCredentials = () =>
  fromIni({
    filepath: path.join(process.cwd(), '.aws', 'credentials'),
    configFilepath: path.join(process.cwd(), '.aws', 'config'),
    profile: 'default'
  });

// Environment-aware DynamoDB configuration
const getDynamoDBConfig = () => {
  const isLocal = process.env.NODE_ENV === 'development' && process.env.DYNAMODB_ENDPOINT
  const isProdOrStaging = ['production', 'staging'].includes(process.env.NODE_ENV)
  
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
    // AWS DynamoDB configuration - match working project pattern
    const config: {
      region: string
      credentials?: { accessKeyId: string; secretAccessKey: string } | ReturnType<typeof fromIni>
    } = {
      region: process.env.REGION || 'eu-central-1'
    }

    // Only add credentials if they are explicitly provided OR in development
    if (process.env.ACCESS_KEY_ID && process.env.SECRET_ACCESS_KEY) {
      config.credentials = {
        accessKeyId: process.env.ACCESS_KEY_ID,
        secretAccessKey: process.env.SECRET_ACCESS_KEY
      }
      console.log('🔧 DynamoDB: Using explicit credentials')
    } else if (!isProdOrStaging) {
      // In development, use local AWS credentials
      config.credentials = loadLocalCredentials()
      console.log('🔧 DynamoDB: Using local AWS credentials')
    } else {
      // In production/staging, rely on IAM role - no credentials specified
      console.log('🔧 DynamoDB: Using IAM role (no explicit credentials)')
    }

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
console.log('🔧 AMPLIFY_ROLE_ARN:', process.env.AMPLIFY_ROLE_ARN || 'NOT SET')

// AWS credentials will be handled by the AWS SDK default credential chain
console.log('🔧 AWS Credentials: Using default credential chain')
