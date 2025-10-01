import { Amplify } from 'aws-amplify'

// AWS AppSync configuration for real-time GraphQL subscriptions
const amplifyConfig = {
  API: {
    GraphQL: {
      endpoint: `https://${process.env.NEXT_PUBLIC_APPSYNC_GRAPHQL_ENDPOINT}`,
      region: process.env.NEXT_PUBLIC_APPSYNC_REGION || 'eu-central-1',
      defaultAuthMode: 'apiKey' as const,
      apiKey: process.env.NEXT_PUBLIC_APPSYNC_API_KEY || '',
    },
  },
}

// Configure Amplify - this will be called on both server and client
console.log('🔧 Amplify Config:', {
  endpoint: process.env.NEXT_PUBLIC_APPSYNC_WEBSOCKET_ENDPOINT ? '✅ Set' : '❌ Missing',
  apiKey: process.env.NEXT_PUBLIC_APPSYNC_API_KEY ? '✅ Set' : '❌ Missing',
  region: process.env.NEXT_PUBLIC_APPSYNC_REGION || 'eu-central-1',
  isClient: typeof window !== 'undefined'
})

// Configure Amplify
try {
  Amplify.configure(amplifyConfig)
  console.log('✅ Amplify configured successfully')
} catch (error) {
  console.error('❌ Error configuring Amplify:', error)
}

export default amplifyConfig
