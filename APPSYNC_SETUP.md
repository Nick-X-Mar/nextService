# AWS AppSync WebSocket Configuration Guide

## Environment Variables Setup

Create a `.env.local` file in your project root with the following variables:

```bash
# AWS AppSync WebSocket Configuration (No GraphQL needed!)
NEXT_PUBLIC_APPSYNC_WEBSOCKET_ENDPOINT=wss://3j332gyqvfgqxpowrk7b3sykte.appsync-realtime-api.eu-central-1.amazonaws.com/graphql
NEXT_PUBLIC_APPSYNC_API_KEY=YOUR_API_KEY_HERE
NEXT_PUBLIC_APPSYNC_REGION=eu-central-1
```

**Note**: We only need the WebSocket endpoint for real-time chat. Your existing REST API handles message storage.

## Steps to Configure

### 1. Get Your API Key
1. Go to AWS AppSync Console
2. Click on your API (`nextservice-chat-events`)
3. Go to "API Key" section
4. Copy the API key (starts with `da2-`)

### 2. Create .env.local File
```bash
# In your project root
touch .env.local
```

### 3. Add Your Values
Replace `YOUR_API_KEY_HERE` with your actual API key from step 1.

### 4. AWS Amplify Environment Variables
When deploying to AWS Amplify, add these same environment variables in:
1. AWS Amplify Console
2. Go to your app
3. Environment variables section
4. Add each variable with the same names

## Security Notes
- ✅ `.env.local` is already in `.gitignore`
- ✅ Never commit API keys to version control
- ✅ Use different API keys for different environments
- ✅ Rotate API keys regularly

## Testing
After setting up the environment variables:
1. Restart your development server: `npm run dev`
2. Test the chat functionality
3. Check browser console for any connection errors
