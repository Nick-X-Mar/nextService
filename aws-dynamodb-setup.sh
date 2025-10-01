#!/bin/bash

# NextService AWS DynamoDB Setup Script
# This script creates all 5 tables with the exact same schema as your local setup

echo "🚀 Creating NextService DynamoDB Tables on AWS..."

# Set your AWS region (change this to your preferred region)
AWS_REGION="eu-central-1"  # Change to us-east-1, eu-central-1, etc.

echo "📍 Using AWS Region: $AWS_REGION"

# 1. Create Clients Table
echo "📋 Creating Clients table..."
aws dynamodb create-table \
    --table-name Clients \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
        AttributeName=email,AttributeType=S \
        AttributeName=phoneNumber,AttributeType=S \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --global-secondary-indexes \
        IndexName=EmailIndex,KeySchema='[{AttributeName=email,KeyType=HASH}]',Projection='{ProjectionType=ALL}',ProvisionedThroughput='{ReadCapacityUnits=5,WriteCapacityUnits=5}' \
        IndexName=PhoneIndex,KeySchema='[{AttributeName=phoneNumber,KeyType=HASH}]',Projection='{ProjectionType=ALL}',ProvisionedThroughput='{ReadCapacityUnits=5,WriteCapacityUnits=5}' \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --region $AWS_REGION

# 2. Create Vehicles Table
echo "🚗 Creating Vehicles table..."
aws dynamodb create-table \
    --table-name Vehicles \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
        AttributeName=clientId,AttributeType=S \
        AttributeName=createdAt,AttributeType=S \
        AttributeName=vinNumber,AttributeType=S \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --global-secondary-indexes \
        IndexName=ClientVehiclesIndex,KeySchema='[{AttributeName=clientId,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}]',Projection='{ProjectionType=ALL}',ProvisionedThroughput='{ReadCapacityUnits=5,WriteCapacityUnits=5}' \
        IndexName=VINIndex,KeySchema='[{AttributeName=vinNumber,KeyType=HASH}]',Projection='{ProjectionType=ALL}',ProvisionedThroughput='{ReadCapacityUnits=5,WriteCapacityUnits=5}' \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --region $AWS_REGION

# 3. Create ServiceRequests Table
echo "🔧 Creating ServiceRequests table..."
aws dynamodb create-table \
    --table-name ServiceRequests \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
        AttributeName=clientId,AttributeType=S \
        AttributeName=createdAt,AttributeType=S \
        AttributeName=vehicleId,AttributeType=S \
        AttributeName=status,AttributeType=S \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --global-secondary-indexes \
        IndexName=ClientRequestsIndex,KeySchema='[{AttributeName=clientId,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}]',Projection='{ProjectionType=ALL}',ProvisionedThroughput='{ReadCapacityUnits=5,WriteCapacityUnits=5}' \
        IndexName=VehicleRequestsIndex,KeySchema='[{AttributeName=vehicleId,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}]',Projection='{ProjectionType=ALL}',ProvisionedThroughput='{ReadCapacityUnits=5,WriteCapacityUnits=5}' \
        IndexName=StatusIndex,KeySchema='[{AttributeName=status,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}]',Projection='{ProjectionType=ALL}',ProvisionedThroughput='{ReadCapacityUnits=5,WriteCapacityUnits=5}' \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --region $AWS_REGION

# 4. Create Garages Table
echo "🏪 Creating Garages table..."
aws dynamodb create-table \
    --table-name Garages \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
        AttributeName=tin,AttributeType=S \
        AttributeName=mobile,AttributeType=S \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --global-secondary-indexes \
        IndexName=TINIndex,KeySchema='[{AttributeName=tin,KeyType=HASH}]',Projection='{ProjectionType=ALL}',ProvisionedThroughput='{ReadCapacityUnits=5,WriteCapacityUnits=5}' \
        IndexName=MobileIndex,KeySchema='[{AttributeName=mobile,KeyType=HASH}]',Projection='{ProjectionType=ALL}',ProvisionedThroughput='{ReadCapacityUnits=5,WriteCapacityUnits=5}' \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --region $AWS_REGION

# 5. Create Offers Table
echo "💰 Creating Offers table..."
aws dynamodb create-table \
    --table-name Offers \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
        AttributeName=serviceRequestId,AttributeType=S \
        AttributeName=createdAt,AttributeType=S \
        AttributeName=garageId,AttributeType=S \
        AttributeName=status,AttributeType=S \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --global-secondary-indexes \
        IndexName=ServiceRequestOffersIndex,KeySchema='[{AttributeName=serviceRequestId,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}]',Projection='{ProjectionType=ALL}',ProvisionedThroughput='{ReadCapacityUnits=5,WriteCapacityUnits=5}' \
        IndexName=GarageOffersIndex,KeySchema='[{AttributeName=garageId,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}]',Projection='{ProjectionType=ALL}',ProvisionedThroughput='{ReadCapacityUnits=5,WriteCapacityUnits=5}' \
        IndexName=StatusIndex,KeySchema='[{AttributeName=status,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}]',Projection='{ProjectionType=ALL}',ProvisionedThroughput='{ReadCapacityUnits=5,WriteCapacityUnits=5}' \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --region $AWS_REGION

# 6. Create ChatMessages Table
echo "💬 Creating ChatMessages table..."
aws dynamodb create-table \
    --table-name ChatMessages \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
        AttributeName=requestId,AttributeType=S \
        AttributeName=timestamp,AttributeType=S \
        AttributeName=senderId,AttributeType=S \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --global-secondary-indexes \
        IndexName=RequestMessagesIndex,KeySchema='[{AttributeName=requestId,KeyType=HASH},{AttributeName=timestamp,KeyType=RANGE}]',Projection='{ProjectionType=ALL}',ProvisionedThroughput='{ReadCapacityUnits=5,WriteCapacityUnits=5}' \
        IndexName=SenderMessagesIndex,KeySchema='[{AttributeName=senderId,KeyType=HASH},{AttributeName=timestamp,KeyType=RANGE}]',Projection='{ProjectionType=ALL}',ProvisionedThroughput='{ReadCapacityUnits=5,WriteCapacityUnits=5}' \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --region $AWS_REGION

echo "✅ All tables created successfully!"
echo "📊 Tables created:"
echo "   - Clients"
echo "   - Vehicles" 
echo "   - ServiceRequests"
echo "   - Garages"
echo "   - Offers"
echo "   - ChatMessages"
echo ""
echo "🔍 You can verify the tables in the AWS Console:"
echo "   https://console.aws.amazon.com/dynamodb/home?region=$AWS_REGION#tables:"
echo ""
echo "⚙️  Next steps:"
echo "   1. Update your environment variables to point to AWS"
echo "   2. Test the connection"
echo "   3. Migrate your local data (optional)"
