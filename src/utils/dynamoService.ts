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
    } else if (!isProdOrStaging) {
      // In development, use local AWS credentials
      config.credentials = loadLocalCredentials()
    }
    // In production/staging without explicit creds, rely on IAM role.

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
