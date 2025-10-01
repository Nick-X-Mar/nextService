# NextService DynamoDB Schema Documentation

## Overview

This document describes the DynamoDB database schema for the NextService application. The database is designed to handle service requests between clients and garages, with a focus on vehicle management and offer tracking.

## Database Architecture

The NextService database consists of **6 main tables** that work together to provide a complete service request management system:

- **Clients** - User/client information
- **Vehicles** - Vehicle information linked to clients
- **ServiceRequests** - Service requests made by clients
- **Garages** - Garage/service provider information
- **Offers** - Offers made by garages for service requests
- **ChatMessages** - Messages between clients and garages for specific requests

## Table Schemas

### 1. Clients Table

**Purpose**: Store client/user information for authentication and communication.

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `id` | String (PK) | Unique client identifier | ✅ |
| `firstName` | String | Client's first name | ✅ |
| `lastName` | String | Client's last name | ❌ |
| `email` | String | Client's email address (null for guest users) | ❌ |
| `phoneNumber` | String | Client's phone number | ❌ |
| `address` | String | Client's address | ❌ |
| `isActive` | Boolean | Whether client account is active | ✅ |
| `createdAt` | String (ISO 8601) | Account creation timestamp | ✅ |
| `updatedAt` | String (ISO 8601) | Last update timestamp | ✅ |

**Global Secondary Indexes:**
- `EmailIndex` (HASH: email) - For email-based lookups
- `PhoneIndex` (HASH: phoneNumber) - For phone-based lookups

**Sample Item:**
```json
{
  "id": "client-1",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "phoneNumber": "+306912345678",
  "address": "Athens, Greece",
  "isActive": true,
  "createdAt": "2024-09-24T19:00:00.000Z",
  "updatedAt": "2024-09-24T19:00:00.000Z"
}
```

**Guest User Example (No Email):**
```json
{
  "id": "client-2",
  "firstName": "Επισκέπτης",
  "isActive": true,
  "createdAt": "2024-09-24T19:00:00.000Z",
  "updatedAt": "2024-09-24T19:00:00.000Z"
}
```

**Registered User Example (With Email):**
```json
{
  "id": "client-3",
  "firstName": "Maria",
  "email": "maria@example.com",
  "phoneNumber": "+306912345678",
  "isActive": true,
  "createdAt": "2024-09-24T19:00:00.000Z",
  "updatedAt": "2024-09-24T19:00:00.000Z"
}
```

---

### 2. Vehicles Table

**Purpose**: Store vehicle information linked to clients for reuse across service requests.

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `id` | String (PK) | Unique vehicle identifier | ✅ |
| `clientId` | String | Reference to client who owns the vehicle | ✅ |
| `brand` | String | Vehicle brand (e.g., Toyota, BMW) | ✅ |
| `model` | String | Vehicle model (e.g., Corolla, X3) | ✅ |
| `modelYear` | String | Year of manufacture | ✅ |
| `vinNumber` | String | Vehicle Identification Number | ✅ |
| `engineCC` | String | Engine displacement in cubic centimeters | ✅ |
| `fuelType` | String | Fuel type (petrol/diesel) | ✅ |
| `isAutomatic` | Boolean | Whether transmission is automatic | ✅ |
| `is4x4` | Boolean | Whether vehicle has 4-wheel drive | ✅ |
| `engineNumber` | String | Engine serial number | ❌ |
| `licensePlate` | String | Vehicle license plate | ❌ |
| `color` | String | Vehicle color | ❌ |
| `nickname` | String | User-defined nickname for the vehicle | ❌ |
| `licensePhotoUrl` | String | S3 URL of license document photo | ❌ |
| `isActive` | Boolean | Whether vehicle is active | ✅ |
| `createdAt` | String (ISO 8601) | Vehicle registration timestamp | ✅ |
| `updatedAt` | String (ISO 8601) | Last update timestamp | ✅ |

**Global Secondary Indexes:**
- `ClientVehiclesIndex` (HASH: clientId, RANGE: createdAt) - Get all vehicles for a client
- `VINIndex` (HASH: vinNumber) - Lookup vehicle by VIN

**Sample Item:**
```json
{
  "id": "vehicle-1",
  "clientId": "client-1",
  "brand": "Toyota",
  "model": "Corolla",
  "modelYear": "2020",
  "vinNumber": "WVWZZZ1JZ3W386752",
  "engineCC": "1600",
  "fuelType": "petrol",
  "isAutomatic": false,
  "is4x4": false,
  "engineNumber": "ABC123456",
  "licensePlate": "ABC-1234",
  "color": "White",
  "nickname": "My Daily Driver",
  "isActive": true,
  "createdAt": "2024-09-24T19:00:00.000Z",
  "updatedAt": "2024-09-24T19:00:00.000Z"
}
```

---

### 3. ServiceRequests Table

**Purpose**: Store service requests made by clients for their vehicles.

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `id` | String (PK) | Unique service request identifier | ✅ |
| `clientId` | String | Reference to client making the request | ✅ |
| `vehicleId` | String | Reference to vehicle needing service | ✅ |
| `category` | String | Service category (service/fanopeia/oils/disk) | ✅ |
| `description` | String | Detailed description of the service needed | ✅ |
| `status` | String | Request status (appointment/pending/in-progress/completed/cancelled) | ✅ |
| `urgency` | String | Request urgency (low/normal/high) | ❌ |
| `estimatedCost` | Number | Estimated cost for the service | ❌ |
| `photoUrls` | Array of Strings | Array of S3 URLs for damage photos | ❌ |
| `photos` | Array of Objects | Detailed photo metadata (S3 URLs, keys, file info) | ❌ |
| `createdAt` | String (ISO 8601) | Request creation timestamp | ✅ |
| `updatedAt` | String (ISO 8601) | Last update timestamp | ✅ |

**Global Secondary Indexes:**
- `ClientRequestsIndex` (HASH: clientId, RANGE: createdAt) - Get all requests for a client
- `VehicleRequestsIndex` (HASH: vehicleId, RANGE: createdAt) - Get all requests for a vehicle
- `StatusIndex` (HASH: status, RANGE: createdAt) - Get requests by status

**Sample Item:**
```json
{
  "id": "request-1",
  "clientId": "client-1",
  "vehicleId": "vehicle-1",
  "category": "service",
  "description": "Θέλω να κάνω service και να δούμε και για δίσκο",
  "status": "pending",
  "urgency": "normal",
  "estimatedCost": null,
  "photoUrls": [
    "https://nextservice-uploads-staging.s3.eu-central-1.amazonaws.com/Requests/vehicle-1/photo1.jpg",
    "https://nextservice-uploads-staging.s3.eu-central-1.amazonaws.com/Requests/vehicle-1/photo2.jpg"
  ],
  "photos": [
    {
      "id": "photo-1",
      "s3Url": "https://nextservice-uploads-staging.s3.eu-central-1.amazonaws.com/Requests/vehicle-1/photo1.jpg",
      "s3Key": "Requests/vehicle-1/photo1.jpg",
      "originalName": "damage-front.jpg",
      "fileSize": 2048576,
      "contentType": "image/jpeg",
      "description": "Damage photo 1",
      "uploadedAt": "2024-09-24T19:00:00.000Z"
    },
    {
      "id": "photo-2",
      "s3Url": "https://nextservice-uploads-staging.s3.eu-central-1.amazonaws.com/Requests/vehicle-1/photo2.jpg",
      "s3Key": "Requests/vehicle-1/photo2.jpg",
      "originalName": "damage-side.jpg",
      "fileSize": 1536000,
      "contentType": "image/jpeg",
      "description": "Damage photo 2",
      "uploadedAt": "2024-09-24T19:00:00.000Z"
    }
  ],
  "createdAt": "2024-09-24T19:00:00.000Z",
  "updatedAt": "2024-09-24T19:00:00.000Z"
}
```

---

### 4. Garages Table

**Purpose**: Store garage/service provider information for SMS notifications and offer management.

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `id` | String (PK) | Unique garage identifier | ✅ |
| `companyName` | String | Company business name (Επωνυμία Εταιρείας) | ✅ |
| `tin` | String | Tax Identification Number - ΑΦΜ (9 digits) | ✅ |
| `email` | String | Company contact email | ✅ |
| `taxAuthority` | String | Tax Authority - ΔΟΥ | ✅ |
| `address` | String | Company physical address | ✅ |
| `mobile` | String | Company mobile phone number | ✅ |
| `isActive` | Boolean | Whether garage is accepting new requests | ✅ |
| `rating` | Number | Average customer rating (0-5) | ❌ |
| `description` | String | Company description and specialties | ❌ |
| `createdAt` | String (ISO 8601) | Company registration timestamp | ✅ |
| `updatedAt` | String (ISO 8601) | Last update timestamp | ✅ |

**Global Secondary Indexes:**
- `TINIndex` (HASH: tin) - For TIN-based lookups
- `MobileIndex` (HASH: mobile) - For SMS notifications

**Sample Item:**
```json
{
  "id": "garage-1",
  "companyName": "ΑΕ Συνεργείο Αυτοκινήτων Παπαδόπουλος",
  "tin": "123456789",
  "email": "info@autoservice-athens.gr",
  "taxAuthority": "ΔΟΥ Αθηνών",
  "address": "Λεωφόρος Πατησιών 123, Αθήνα",
  "mobile": "+306984959044",
  "isActive": true,
  "rating": 4.5,
  "description": "Εταιρεία εγγεγραμμένη στο NextService",
  "createdAt": "2024-09-24T19:00:00.000Z",
  "updatedAt": "2024-09-24T19:00:00.000Z"
}
```

---

### 5. Offers Table

**Purpose**: Store offers made by garages for service requests.

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `id` | String (PK) | Unique offer identifier | ✅ |
| `serviceRequestId` | String | Reference to the service request | ✅ |
| `garageId` | String | Reference to the garage making the offer | ✅ |
| `price` | Number | Offer price in the specified currency | ✅ |
| `currency` | String | Currency code (EUR/USD) | ✅ |
| `description` | String | Detailed description of the offer | ✅ |
| `estimatedDuration` | String | Estimated time to complete the service | ❌ |
| `warranty` | String | Warranty information | ❌ |
| `status` | String | Offer status (pending/accepted/rejected/expired) | ✅ |
| `createdAt` | String (ISO 8601) | Offer creation timestamp | ✅ |
| `updatedAt` | String (ISO 8601) | Last update timestamp | ✅ |

**Global Secondary Indexes:**
- `ServiceRequestOffersIndex` (HASH: serviceRequestId, RANGE: createdAt) - Get all offers for a request
- `GarageOffersIndex` (HASH: garageId, RANGE: createdAt) - Get all offers from a garage
- `StatusIndex` (HASH: status, RANGE: createdAt) - Get offers by status

**Sample Item:**
```json
{
  "id": "offer-1",
  "serviceRequestId": "request-1",
  "garageId": "garage-1",
  "price": 150,
  "currency": "EUR",
  "description": "Full service including oil change, filters, and brake disc inspection",
  "estimatedDuration": "2-3 hours",
  "warranty": "6 months",
  "status": "pending",
  "createdAt": "2024-09-24T19:00:00.000Z",
  "updatedAt": "2024-09-24T19:00:00.000Z"
}
```

## Relationships

### Entity Relationship Diagram

```
Clients (1) ──── (N) Vehicles
   │                    │
   │                    │
   └─── (N) ServiceRequests (N) ──── Garages
              │                        │
              │                        │
              └─── (N) Offers ─────────┘
```

### Key Relationships

1. **Client → Vehicles**: One-to-Many
   - A client can have multiple vehicles
   - Each vehicle belongs to one client

2. **Client → ServiceRequests**: One-to-Many
   - A client can make multiple service requests
   - Each service request belongs to one client

3. **Vehicle → ServiceRequests**: One-to-Many
   - A vehicle can have multiple service requests
   - Each service request is for one vehicle

4. **ServiceRequest → Offers**: One-to-Many
   - A service request can receive multiple offers
   - Each offer is for one service request

5. **Garage → Offers**: One-to-Many
   - A garage can make multiple offers
   - Each offer is made by one garage

## Query Patterns

### Common Queries

1. **Get all vehicles for a client**
   ```bash
   aws dynamodb query \
     --table-name Vehicles \
     --index-name ClientVehiclesIndex \
     --key-condition-expression "clientId = :clientId" \
     --expression-attribute-values '{":clientId": {"S": "client-1"}}'
   ```

2. **Get all service requests for a client**
   ```bash
   aws dynamodb query \
     --table-name ServiceRequests \
     --index-name ClientRequestsIndex \
     --key-condition-expression "clientId = :clientId" \
     --expression-attribute-values '{":clientId": {"S": "client-1"}}'
   ```

3. **Get all offers for a service request**
   ```bash
   aws dynamodb query \
     --table-name Offers \
     --index-name ServiceRequestOffersIndex \
     --key-condition-expression "serviceRequestId = :requestId" \
     --expression-attribute-values '{":requestId": {"S": "request-1"}}'
   ```

4. **Get all active garages for SMS notifications**
   ```bash
   aws dynamodb scan \
     --table-name Garages \
     --filter-expression "isActive = :active" \
     --expression-attribute-values '{":active": {"BOOL": true}}'
   ```

## Development Setup

### Local DynamoDB

For local development, DynamoDB Local is used:

- **Endpoint**: `http://localhost:8000`
- **Region**: `us-east-1`
- **Access Key**: `dummy`
- **Secret Key**: `dummy`

### GUI Access

- **DynamoDB Admin**: `http://localhost:8001`
- **AWS CLI**: Use `--endpoint-url http://localhost:8000`

### Environment Variables

```bash
# Local Development
AWS_ACCESS_KEY_ID=dummy
AWS_SECRET_ACCESS_KEY=dummy
AWS_REGION=us-east-1
DYNAMODB_ENDPOINT=http://localhost:8000

# Production
AWS_ACCESS_KEY_ID=your_production_key
AWS_SECRET_ACCESS_KEY=your_production_secret
AWS_REGION=eu-west-1
```

## Data Types

### DynamoDB Data Types Used

- **String (S)**: Text data, IDs, timestamps
- **Number (N)**: Prices, ratings, counts
- **Boolean (BOOL)**: Flags, status indicators
- **String Set (SS)**: Arrays of strings (services)

---

### 6. ChatMessages Table

**Purpose**: Store messages between clients and garages for specific service requests.

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `id` | String (PK) | Unique message identifier | ✅ |
| `requestId` | String | Reference to the service request | ✅ |
| `senderId` | String | ID of the sender (client or garage) | ✅ |
| `senderType` | String | Type of sender (client/garage) | ✅ |
| `senderName` | String | Display name of the sender | ✅ |
| `message` | String | The message content | ✅ |
| `timestamp` | String (ISO 8601) | Message timestamp | ✅ |
| `createdAt` | String (ISO 8601) | Message creation timestamp | ✅ |

**Global Secondary Indexes:**
- `RequestMessagesIndex` (HASH: requestId, RANGE: timestamp) - Get all messages for a request
- `SenderMessagesIndex` (HASH: senderId, RANGE: timestamp) - Get all messages from a sender

**Sample Item:**
```json
{
  "id": "msg-1759063220039-abc123def",
  "requestId": "sr-1759063220039-rsjblvy1v",
  "senderId": "garage-1759169248452-40o4x992z",
  "senderType": "garage",
  "senderName": "ΑΕ Συνεργείο Παπαδόπουλος",
  "message": "Γεια σας! Θα θέλαμε να ρωτήσουμε για το πρόβλημα με το αυτοκίνητό σας. Πότε άρχισε να εμφανίζεται;",
  "timestamp": "2024-09-24T19:00:00.000Z",
  "createdAt": "2024-09-24T19:00:00.000Z"
}
```

---

### Timestamp Format

All timestamps use ISO 8601 format: `YYYY-MM-DDTHH:mm:ss.sssZ`

Example: `2024-09-24T19:00:00.000Z`

## Best Practices

1. **Consistent Naming**: Use kebab-case for IDs (client-1, vehicle-1)
2. **Timestamps**: Always include createdAt and updatedAt
3. **Status Fields**: Use consistent status values across tables
4. **Indexes**: Create GSI for common query patterns
5. **Data Validation**: Validate data before storing
6. **Soft Deletes**: Use isActive flags instead of hard deletes

## Future Enhancements

1. **Notifications Table**: Track SMS/email notifications sent
2. **Reviews Table**: Store client reviews for garages
3. **Appointments Table**: Schedule service appointments
4. **Payments Table**: Track payment information
5. **Real-time Chat**: WebSocket integration for instant messaging
6. **File Attachments**: Support for images and documents in chat

---

*Last Updated: September 24, 2024*
*Version: 1.0*
