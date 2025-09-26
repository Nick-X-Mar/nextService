# Manual AWS Setup Instructions

If you prefer to set up AWS resources manually through the AWS Console, follow these steps:

## 1. Create S3 Bucket

1. Go to [AWS S3 Console](https://s3.console.aws.amazon.com/)
2. Click "Create bucket"
3. Bucket name: `nextservice-uploads`
4. Region: `Europe (Ireland) eu-west-1`
5. Uncheck "Block all public access" (we'll configure this later)
6. Click "Create bucket"

### Configure S3 Bucket CORS

1. Select your bucket
2. Go to "Permissions" tab
3. Scroll down to "Cross-origin resource sharing (CORS)"
4. Click "Edit" and add:

```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
        "AllowedOrigins": ["*"],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": 3000
    }
]
```

## 2. Create IAM User

1. Go to [AWS IAM Console](https://console.aws.amazon.com/iam/)
2. Click "Users" → "Create user"
3. User name: `nextservice-app-user`
4. Select "Programmatic access"
5. Click "Next: Permissions"

### Create IAM Policy

1. Click "Attach policies directly"
2. Click "Create policy"
3. Go to "JSON" tab and paste:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "S3BucketAccess",
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::nextservice-uploads",
                "arn:aws:s3:::nextservice-uploads/*"
            ]
        },
        {
            "Sid": "DynamoDBAccess",
            "Effect": "Allow",
            "Action": [
                "dynamodb:GetItem",
                "dynamodb:PutItem",
                "dynamodb:UpdateItem",
                "dynamodb:DeleteItem",
                "dynamodb:Query",
                "dynamodb:Scan",
                "dynamodb:BatchGetItem",
                "dynamodb:BatchWriteItem"
            ],
            "Resource": [
                "arn:aws:dynamodb:eu-west-1:*:table/Clients",
                "arn:aws:dynamodb:eu-west-1:*:table/Vehicles",
                "arn:aws:dynamodb:eu-west-1:*:table/ServiceRequests",
                "arn:aws:dynamodb:eu-west-1:*:table/ServiceRequestPhotos",
                "arn:aws:dynamodb:eu-west-1:*:table/Garages",
                "arn:aws:dynamodb:eu-west-1:*:table/Offers",
                "arn:aws:dynamodb:eu-west-1:*:table/Clients/index/*",
                "arn:aws:dynamodb:eu-west-1:*:table/Vehicles/index/*",
                "arn:aws:dynamodb:eu-west-1:*:table/ServiceRequests/index/*",
                "arn:aws:dynamodb:eu-west-1:*:table/ServiceRequestPhotos/index/*",
                "arn:aws:dynamodb:eu-west-1:*:table/Garages/index/*",
                "arn:aws:dynamodb:eu-west-1:*:table/Offers/index/*"
            ]
        },
        {
            "Sid": "SNSAccess",
            "Effect": "Allow",
            "Action": [
                "sns:Publish"
            ],
            "Resource": "*"
        }
    ]
}
```

4. Click "Next: Tags" → "Next: Review"
5. Name: `NextServicePolicy`
6. Click "Create policy"

### Attach Policy to User

1. Go back to user creation
2. Search for "NextServicePolicy"
3. Select it and click "Next: Tags" → "Next: Review"
4. Click "Create user"
5. **IMPORTANT**: Save the Access Key ID and Secret Access Key

## 3. Create DynamoDB Tables

Go to [AWS DynamoDB Console](https://console.aws.amazon.com/dynamodb/) and create these tables:

### Clients Table
- Table name: `Clients`
- Partition key: `id` (String)
- Global Secondary Indexes:
  - `EmailIndex`: Partition key `email` (String)
  - `PhoneIndex`: Partition key `phoneNumber` (String)

### Vehicles Table
- Table name: `Vehicles`
- Partition key: `id` (String)
- Global Secondary Indexes:
  - `ClientVehiclesIndex`: Partition key `clientId` (String), Sort key `createdAt` (String)
  - `VINIndex`: Partition key `vinNumber` (String)

### ServiceRequestPhotos Table
- Table name: `ServiceRequestPhotos`
- Partition key: `id` (String)
- Global Secondary Indexes:
  - `ServiceRequestPhotosIndex`: Partition key `serviceRequestId` (String), Sort key `createdAt` (String)

### ServiceRequests Table
- Table name: `ServiceRequests`
- Partition key: `id` (String)
- Global Secondary Indexes:
  - `ClientRequestsIndex`: Partition key `clientId` (String), Sort key `createdAt` (String)
  - `VehicleRequestsIndex`: Partition key `vehicleId` (String), Sort key `createdAt` (String)
  - `StatusIndex`: Partition key `status` (String), Sort key `createdAt` (String)

### Garages Table
- Table name: `Garages`
- Partition key: `id` (String)
- Global Secondary Indexes:
  - `PhoneNumberIndex`: Partition key `phoneNumber` (String)

### Offers Table
- Table name: `Offers`
- Partition key: `id` (String)
- Global Secondary Indexes:
  - `ServiceRequestOffersIndex`: Partition key `serviceRequestId` (String), Sort key `createdAt` (String)
  - `GarageOffersIndex`: Partition key `garageId` (String), Sort key `createdAt` (String)
  - `StatusIndex`: Partition key `status` (String), Sort key `createdAt` (String)

## 4. Configure AWS CLI

Run these commands in your terminal:

```bash
aws configure
```

Enter:
- AWS Access Key ID: [Your access key]
- AWS Secret Access Key: [Your secret key]
- Default region name: `eu-west-1`
- Default output format: `json`

## 5. Test Your Setup

Run these commands to verify everything is working:

```bash
# Test S3 access
aws s3 ls s3://nextservice-uploads

# Test DynamoDB access
aws dynamodb list-tables

# Test SNS access (optional)
aws sns list-topics
```

## Next Steps

1. Add the AWS credentials to your `.env.local` file
2. Deploy your app to AWS Amplify
3. Configure environment variables in Amplify console
4. Test file uploads and database operations
