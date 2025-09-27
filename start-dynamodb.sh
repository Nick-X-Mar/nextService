#!/bin/bash

# Start DynamoDB Local and Admin UI
# This script starts both DynamoDB Local and the web admin interface

echo "🚀 Starting DynamoDB Local and Admin UI..."

# Function to cleanup background processes on exit
cleanup() {
    echo "🛑 Stopping DynamoDB services..."
    kill $DYNAMODB_PID $ADMIN_PID 2>/dev/null
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Start DynamoDB Local in background
echo "📊 Starting DynamoDB Local on port 8000..."
cd dynamodb-local
java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -sharedDb -port 8000 &
DYNAMODB_PID=$!

# Wait a moment for DynamoDB to start
sleep 3

# Start DynamoDB Admin UI in background
echo "🌐 Starting DynamoDB Admin UI on port 8001..."
cd ..
npx dynamodb-admin --port 8001 &
ADMIN_PID=$!

# Wait a moment for Admin UI to start
sleep 2

echo ""
echo "✅ DynamoDB services are running!"
echo "📊 DynamoDB Local: http://localhost:8000"
echo "🌐 Admin UI: http://localhost:8001"
echo ""
echo "Press Ctrl+C to stop both services"

# Wait for user to stop
wait
