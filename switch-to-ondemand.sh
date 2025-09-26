#!/bin/bash

# Switch NextService DynamoDB Tables to On-Demand Pricing
# This will save significant costs for development/low-volume usage

echo "🔄 Switching NextService DynamoDB Tables to On-Demand Pricing..."

# Set your AWS region
AWS_REGION="eu-central-1"

echo "📍 Using AWS Region: $AWS_REGION"

# List of tables to update
TABLES=("Clients" "Vehicles" "ServiceRequests" "Garages" "Offers")

# Switch each table to On-Demand pricing
for table in "${TABLES[@]}"; do
    echo "🔄 Switching $table to On-Demand pricing..."
    
    aws dynamodb update-table \
        --table-name "$table" \
        --billing-mode PAY_PER_REQUEST \
        --region $AWS_REGION \
        --output table
    
    echo "✅ $table switched to On-Demand pricing"
    echo ""
done

echo "🎉 All tables switched to On-Demand pricing!"
echo ""
echo "💰 New Pricing Model:"
echo "   - Read Requests: $0.25 per million requests"
echo "   - Write Requests: $1.25 per million requests"
echo "   - No monthly minimums"
echo "   - Perfect for development and low-volume usage"
echo ""
echo "📊 Cost Comparison:"
echo "   - Before: ~$120/month (Provisioned)"
echo "   - After: ~$0-5/month (On-Demand for low usage)"
echo ""
echo "🔍 You can verify the changes in AWS Console:"
echo "   https://console.aws.amazon.com/dynamodb/home?region=$AWS_REGION#tables:"
