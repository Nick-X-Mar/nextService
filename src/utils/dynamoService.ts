import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { fromIni } from '@aws-sdk/credential-provider-ini'
import { fromNodeProviderChain } from '@aws-sdk/credential-providers'
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
  const isProd = ['production', 'staging'].includes(process.env.NODE_ENV)
  
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
      credentials?: ReturnType<typeof fromNodeProviderChain> | { accessKeyId: string; secretAccessKey: string } | ReturnType<typeof fromIni>
    } = {
      region: process.env.REGION || 'eu-central-1'
    }

    // Only add credentials if they are provided (for IAM role, don't add credentials)
    if (process.env.ACCESS_KEY_ID && process.env.SECRET_ACCESS_KEY) {
      config.credentials = {
        accessKeyId: process.env.ACCESS_KEY_ID,
        secretAccessKey: process.env.SECRET_ACCESS_KEY
      }
    } else if (isProd) {
      // In production, try different credential providers for Amplify
      console.log('🔧 Using IAM role for DynamoDB (production)')
      try {
        // Try instance metadata first (for Lambda/Amplify)
        config.credentials = fromNodeProviderChain({
          profile: 'default'
        })
        console.log('🔧 DynamoDB: Using node provider chain with default profile')
      } catch {
        console.log('🔧 DynamoDB: Node provider chain failed, trying without credentials')
        // Don't set credentials - let AWS SDK use default chain
      }
    } else {
      // In development, try to use local AWS credentials
      try {
        config.credentials = loadLocalCredentials()
        console.log('🔧 Using local AWS credentials for DynamoDB')
      } catch {
        config.credentials = fromNodeProviderChain()
        console.log('🔧 Using node provider chain for DynamoDB')
      }
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

// Test AWS credentials availability
try {
  fromNodeProviderChain()
  console.log('🔧 AWS Credentials Provider: Available')
} catch (error) {
  console.log('🔧 AWS Credentials Provider: Error', error)
}
