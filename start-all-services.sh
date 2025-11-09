#!/bin/bash

# Start All Local Services
# This script starts DynamoDB Local, Admin UI, and AppSync Mock Server

echo "🚀 Starting all local services..."
echo ""

# Function to cleanup background processes on exit
cleanup() {
    echo ""
    echo "🛑 Stopping all services..."
    kill $DYNAMODB_PID $ADMIN_PID $APPSYNC_PID 2>/dev/null
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Start DynamoDB Local in background
echo "📊 Starting DynamoDB Local on port 8000..."
cd dynamodb-local
java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -sharedDb -port 8000 &
DYNAMODB_PID=$!
cd ..

# Wait a moment for DynamoDB to start
sleep 3

# Start DynamoDB Admin UI in background
echo "🌐 Starting DynamoDB Admin UI on port 8001..."
npx dynamodb-admin --port 8001 &
ADMIN_PID=$!

# Wait a moment for Admin UI to start
sleep 2

# Start AppSync Mock Server in background
echo "📡 Starting AppSync Mock Server on port 3002..."
node local-appsync-server.js &
APPSYNC_PID=$!

# Wait a moment for AppSync to start
sleep 2

echo ""
echo "✅ All services are running!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 DynamoDB Local:    http://localhost:8000"
echo "🌐 DynamoDB Admin UI: http://localhost:8001"
echo "📡 AppSync Mock:      ws://localhost:3002/graphql"
echo "🏥 AppSync Health:    http://localhost:3002/health"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Next.js dev server (port 3000) should be run separately"
echo "   Run 'npm run dev' in another terminal"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for user to stop
wait

