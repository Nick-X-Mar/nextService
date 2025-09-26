# AWS DynamoDB Manual Setup Guide

## Prerequisites

1. **AWS Account** with DynamoDB permissions
2. **AWS CLI** installed and configured (optional, for script method)
3. **Access to AWS Console**

## Method 1: AWS Console (Manual) - Recommended for Beginners

### Step 1: Access DynamoDB Console

1. Go to [AWS Console](https://aws.amazon.com/console/)
2. Sign in to your AWS account
3. Search for "DynamoDB" in the services search bar
4. Click on "DynamoDB" to open the service

### Step 2: Create Tables (One by One)

#### Table 1: Clients

1. **Click "Create table"**
2. **Table name**: `Clients`
3. **Partition key**: `id` (String)
4. **Table settings**: Use default settings
5. **Click "Create table"**

**After table creation, add Global Secondary Indexes:**

1. **Go to "Indexes" tab**
2. **Click "Create index"**
3. **Index name**: `EmailIndex`
   - **Partition key**: `email` (String)
   - **Projected attributes**: All
   - **Read/Write capacity**: 5/5
4. **Click "Create index"**

5. **Click "Create index" again**
6. **Index name**: `PhoneIndex`
   - **Partition key**: `phoneNumber` (String)
   - **Projected attributes**: All
   - **Read/Write capacity**: 5/5
7. **Click "Create index"**

#### Table 2: Vehicles

1. **Click "Create table"**
2. **Table name**: `Vehicles`
3. **Partition key**: `id` (String)
4. **Table settings**: Use default settings
5. **Click "Create table"**

**Add Global Secondary Indexes:**

1. **Index name**: `ClientVehiclesIndex`
   - **Partition key**: `clientId` (String)
   - **Sort key**: `createdAt` (String)
   - **Projected attributes**: All
   - **Read/Write capacity**: 5/5

2. **Index name**: `VINIndex`
   - **Partition key**: `vinNumber` (String)
   - **Projected attributes**: All
   - **Read/Write capacity**: 5/5

#### Table 3: ServiceRequests

1. **Click "Create table"**
2. **Table name**: `ServiceRequests`
3. **Partition key**: `id` (String)
4. **Table settings**: Use default settings
5. **Click "Create table"**

**Add Global Secondary Indexes:**

1. **Index name**: `ClientRequestsIndex`
   - **Partition key**: `clientId` (String)
   - **Sort key**: `createdAt` (String)
   - **Projected attributes**: All
   - **Read/Write capacity**: 5/5

2. **Index name**: `VehicleRequestsIndex`
   - **Partition key**: `vehicleId` (String)
   - **Sort key**: `createdAt` (String)
   - **Projected attributes**: All
   - **Read/Write capacity**: 5/5

3. **Index name**: `StatusIndex`
   - **Partition key**: `status` (String)
   - **Sort key**: `createdAt` (String)
   - **Projected attributes**: All
   - **Read/Write capacity**: 5/5

#### Table 4: Garages

1. **Click "Create table"**
2. **Table name**: `Garages`
3. **Partition key**: `id` (String)
4. **Table settings**: Use default settings
5. **Click "Create table"**

**Add Global Secondary Index:**

1. **Index name**: `PhoneNumberIndex`
   - **Partition key**: `phoneNumber` (String)
   - **Projected attributes**: All
   - **Read/Write capacity**: 5/5

#### Table 5: Offers

1. **Click "Create table"**
2. **Table name**: `Offers`
3. **Partition key**: `id` (String)
4. **Table settings**: Use default settings
5. **Click "Create table"**

**Add Global Secondary Indexes:**

1. **Index name**: `ServiceRequestOffersIndex`
   - **Partition key**: `serviceRequestId` (String)
   - **Sort key**: `createdAt` (String)
   - **Projected attributes**: All
   - **Read/Write capacity**: 5/5

2. **Index name**: `GarageOffersIndex`
   - **Partition key**: `garageId` (String)
   - **Sort key**: `createdAt` (String)
   - **Projected attributes**: All
   - **Read/Write capacity**: 5/5

3. **Index name**: `StatusIndex`
   - **Partition key**: `status` (String)
   - **Sort key**: `createdAt` (String)
   - **Projected attributes**: All
   - **Read/Write capacity**: 5/5

## Method 2: AWS CLI (Automated) - For Advanced Users

### Prerequisites

1. **Install AWS CLI**: https://aws.amazon.com/cli/
2. **Configure AWS CLI**: `aws configure`
3. **Set up credentials** with DynamoDB permissions

### Run the Setup Script

```bash
# Make the script executable
chmod +x aws-dynamodb-setup.sh

# Run the script
./aws-dynamodb-setup.sh
```

## Verification

### Check Tables in AWS Console

1. Go to DynamoDB console
2. Click on "Tables" in the left sidebar
3. Verify all 5 tables are created:
   - ✅ Clients
   - ✅ Vehicles
   - ✅ ServiceRequests
   - ✅ Garages
   - ✅ Offers

### Check Indexes

For each table, click on it and verify the Global Secondary Indexes are created correctly.

## Environment Configuration

### Update Your Environment Variables

Create a new `.env.local` file or update your existing one:

```bash
# AWS Production Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=eu-west-1  # or your preferred region
DYNAMODB_ENDPOINT=  # Leave empty for AWS (not local)

# Remove local DynamoDB settings
# AWS_ACCESS_KEY_ID=dummy
# AWS_SECRET_ACCESS_KEY=dummy
# DYNAMODB_ENDPOINT=http://localhost:8000
```

### Update Your Application

In your `dynamoService.ts`, make sure it's configured to use AWS:

```typescript
// This should automatically use AWS when DYNAMODB_ENDPOINT is not set
const dynamoDB = new DynamoDBClient({
  region: process.env.AWS_REGION || 'eu-west-1',
  ...(process.env.DYNAMODB_ENDPOINT && {
    endpoint: process.env.DYNAMODB_ENDPOINT
  })
})
```

## Cost Considerations

### Pricing (as of 2024)

- **On-Demand**: Pay per request (good for development)
- **Provisioned**: Fixed capacity (good for production)

### Recommended Settings

- **Development**: Use On-Demand pricing
- **Production**: Start with 5 Read/Write Capacity Units per table
- **Monitor usage** and adjust as needed

### Cost Optimization

1. **Start small**: 5 RCU/WCU per table
2. **Monitor CloudWatch**: Track usage patterns
3. **Use On-Demand** for unpredictable workloads
4. **Use Provisioned** for predictable workloads

## Security Best Practices

### IAM Permissions

Create a dedicated IAM user with minimal permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:REGION:ACCOUNT:table/Clients",
        "arn:aws:dynamodb:REGION:ACCOUNT:table/Vehicles",
        "arn:aws:dynamodb:REGION:ACCOUNT:table/ServiceRequests",
        "arn:aws:dynamodb:REGION:ACCOUNT:table/Garages",
        "arn:aws:dynamodb:REGION:ACCOUNT:table/Offers"
      ]
    }
  ]
}
```

### Environment Variables

- **Never commit** AWS credentials to version control
- **Use AWS Secrets Manager** for production
- **Rotate credentials** regularly

## Testing the Setup

### Test Connection

```bash
# Test with AWS CLI
aws dynamodb list-tables --region eu-west-1

# Should return your 5 tables
```

### Test from Application

1. **Update environment variables**
2. **Restart your application**
3. **Test a simple operation** (like creating a client)
4. **Check AWS Console** to verify data is being written

## Troubleshooting

### Common Issues

1. **Permission Denied**: Check IAM permissions
2. **Region Mismatch**: Ensure region is consistent
3. **Table Not Found**: Verify table names match exactly
4. **Index Not Found**: Check GSI creation status

### Debug Steps

1. **Check AWS CLI configuration**: `aws configure list`
2. **Test permissions**: `aws dynamodb list-tables`
3. **Check CloudWatch logs** for detailed error messages
4. **Verify table status** in AWS Console

## Next Steps

1. ✅ **Create all 5 tables**
2. ✅ **Verify indexes are created**
3. ✅ **Update environment variables**
4. ✅ **Test connection**
5. 🔄 **Migrate local data** (optional)
6. 🚀 **Deploy to production**

---

*This guide ensures your AWS DynamoDB setup matches your local development environment exactly.*
