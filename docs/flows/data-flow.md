# Data Flow Documentation

## Overview

This document describes how data flows through the NextService application, from user interactions to database storage and real-time updates.

## Data Flow Architecture

```mermaid
flowchart TB
    subgraph UI["User Interface Layer"]
        ClientUI[Client Components]
        GarageUI[Garage Components]
        SharedUI[Shared Components]
    end
    
    subgraph API["API Layer"]
        AuthAPI[Auth Routes]
        RequestAPI[Request Routes]
        OfferAPI[Offer Routes]
        ChatAPI[Chat Routes]
        GarageAPI[Garage Routes]
    end
    
    subgraph Services["Service Layer"]
        DynamoService[DynamoDB Service]
        S3Service[S3 Service]
        AppSyncService[AppSync Service]
        NotificationService[Notification Service]
    end
    
    subgraph Storage["Storage Layer"]
        DynamoDB[(DynamoDB Tables)]
        S3[(S3 Bucket)]
        LocalStorage[Browser localStorage]
    end
    
    UI -->|HTTP Requests| API
    API -->|Service Calls| Services
    Services -->|Read/Write| Storage
    Services -->|Real-time| UI
    
    style UI fill:#e1f5ff,stroke:#333,stroke-width:2px
    style API fill:#fff4e1,stroke:#333,stroke-width:2px
    style Services fill:#e8f5e9,stroke:#333,stroke-width:2px
    style Storage fill:#fce4ec,stroke:#333,stroke-width:2px
```

## Service Request Creation Flow

### Complete Data Flow

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Landing Page UI
    participant LS as localStorage
    participant API as Service Request API
    participant DB as DynamoDB
    participant S3 as S3 Bucket
    
    U->>UI: Fill Category, Brand, Model
    UI->>LS: Save form data (formStorage)
    
    U->>UI: Enter Model Year
    UI->>LS: Save model year
    
    U->>UI: Enter VIN, Engine, Upload Photos
    UI->>S3: Upload photos
    S3-->>UI: Return S3 URLs
    
    U->>UI: Submit Request
    UI->>API: POST /api/service-request<br/>{category, description, vehicle, photos}
    
    API->>DB: Create ServiceRequest record
    API->>DB: Create Vehicle record
    API->>DB: Create Client record (if guest)
    
    DB-->>API: Return IDs
    API-->>UI: Return {serviceRequestId, clientId, vehicleId}
    
    UI->>LS: Store clientId
    UI->>LS: Store pendingRegistrationData (if guest)
    UI->>U: Redirect to /requests/{clientId}
```

### Data Structures

**Form Data (localStorage):**
```json
{
  "category": "service",
  "description": "Service description",
  "brand": "toyota",
  "model": "Corolla",
  "modelYear": "2020",
  "vinNumber": "ABC123...",
  "engineNumber": "ENG123...",
  "engineCC": "1800",
  "fuelType": "petrol",
  "isAutomatic": false,
  "is4x4": false,
  "estimatedPrice": 150
}
```

**ServiceRequest (DynamoDB):**
```json
{
  "id": "sr-timestamp-random",
  "clientId": "client-timestamp-random",
  "vehicleId": "vehicle-timestamp-random",
  "category": "service",
  "description": "Service description",
  "status": "pending",
  "estimatedCost": 150,
  "photoUrls": ["s3://bucket/key"],
  "photos": [{
    "id": "photo-id",
    "s3Url": "https://...",
    "s3Key": "key",
    "originalName": "photo.jpg",
    "fileSize": 12345,
    "contentType": "image/jpeg",
    "uploadedAt": "2024-12-25T10:00:00Z"
  }],
  "createdAt": "2024-12-25T10:00:00Z",
  "updatedAt": "2024-12-25T10:00:00Z"
}
```

**Vehicle (DynamoDB):**
```json
{
  "id": "vehicle-timestamp-random",
  "clientId": "client-timestamp-random",
  "brand": "Toyota",
  "model": "Corolla",
  "modelYear": "2020",
  "vinNumber": "ABC123...",
  "engineNumber": "ENG123...",
  "engineCC": "1800",
  "fuelType": "petrol",
  "isAutomatic": false,
  "is4x4": false,
  "isActive": true,
  "createdAt": "2024-12-25T10:00:00Z",
  "updatedAt": "2024-12-25T10:00:00Z"
}
```

**Client (DynamoDB - Guest):**
```json
{
  "id": "client-timestamp-random",
  "firstName": "Επισκέπτης",
  "isActive": true,
  "createdAt": "2024-12-25T10:00:00Z",
  "updatedAt": "2024-12-25T10:00:00Z"
}
```

## Login & Authentication Flow

### Data Flow

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Login Page
    participant API as Auth API
    participant DB as DynamoDB
    participant LS as localStorage
    participant CTX as UserContext
    
    U->>UI: Enter Email
    UI->>API: POST /api/auth/login<br/>{email, userType}
    
    API->>DB: Query Clients/Garages table<br/>by email
    DB-->>API: Return user data
    
    alt User Found
        API-->>UI: Return {success: true, user: {...}}
        UI->>LS: Store clientId/garageId
        UI->>CTX: refreshUser(clientId)
        CTX->>API: GET /api/clients/{clientId}
        API->>DB: Query Clients table
        DB-->>API: Return client data
        API-->>CTX: Return client
        CTX->>UI: Update user state
        UI->>U: Redirect to dashboard
    else User Not Found
        API-->>UI: Return {success: false}
        UI->>U: Show registration option
    end
```

### Session Management

**localStorage Keys:**
- `clientId`: Current client session ID
- `garageId`: Current garage session ID
- `pendingRegistrationData`: Guest request data for deduplication

**UserContext State:**
```typescript
{
  user: {
    id: string
    firstName: string
    lastName?: string
    email?: string
    phoneNumber?: string
    isRegistered: boolean
  }
  isLoading: boolean
}
```

## Offer Creation Flow

### Data Flow

```mermaid
sequenceDiagram
    participant G as Garage
    participant UI as Offer Page
    participant API as Offers API
    participant DB as DynamoDB
    participant C as Client (via AppSync)
    
    G->>UI: Fill Offer Form<br/>{price, benefits, dates}
    UI->>API: POST /api/offers<br/>{serviceRequestId, garageId, offerAmount, benefits, availabilityDates}
    
    API->>DB: Create/Update Offer record
    DB-->>API: Return offer data
    
    API-->>UI: Return {success: true, offer: {...}}
    UI->>G: Show success message
    
    Note over C: Client sees offer on next page load<br/>or real-time update (if implemented)
```

### Offer Data Structure

**Offer (DynamoDB):**
```json
{
  "id": "offer-timestamp-random",
  "offerNumber": "Offer_251224_5",
  "serviceRequestId": "sr-...",
  "garageId": "garage-...",
  "estimatedCost": 150,
  "offerAmount": 140,
  "currency": "EUR",
  "status": "pending",
  "benefits": ["Free pickup", "Warranty"],
  "availabilityDates": ["2024-12-26", "2024-12-27"],
  "createdAt": "2024-12-25T10:00:00Z",
  "updatedAt": "2024-12-25T10:00:00Z"
}
```

## Offer Acceptance Flow

### Data Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant UI as Request Details UI
    participant API as Accept Offer API
    participant DB as DynamoDB
    participant G as Garage (via AppSync)
    
    C->>UI: Click Accept Offer
    UI->>API: PATCH /api/requests/{requestId}/accept-offer<br/>{offerId, appointmentDate, appointmentPrice}
    
    API->>DB: Update ServiceRequest<br/>status → 'appointment'<br/>acceptedOfferId, appointmentDate, appointmentPrice
    
    API->>DB: Query all Offers for requestId
    DB-->>API: Return all offers
    
    loop For each offer
        alt Offer is accepted
            API->>DB: Update offer status → 'accepted'
        else Offer is rejected
            API->>DB: Update offer status → 'rejected'
        end
    end
    
    DB-->>API: Confirm updates
    API-->>UI: Return updated request
    
    UI->>C: Show success, refresh list
    Note over G: Garage sees status change<br/>in dashboard (on refresh)
```

### Status Update Data

**ServiceRequest Update:**
```json
{
  "status": "appointment",
  "acceptedOfferId": "offer-...",
  "appointmentDate": "2024-12-25",
  "appointmentPrice": 150,
  "updatedAt": "2024-12-25T10:05:00Z"
}
```

**Offers Update:**
```json
// Accepted offer
{
  "id": "offer-...",
  "status": "accepted",
  "appointmentDate": "2024-12-25",
  "appointmentPrice": 150
}

// Rejected offers
{
  "id": "offer-other-...",
  "status": "rejected"
}
```

## Chat Message Flow

### Data Flow

```mermaid
sequenceDiagram
    participant S as Sender (Client/Garage)
    participant UI as Chat UI
    participant API as Chat API
    participant DB as DynamoDB
    participant AS as AppSync
    participant R as Receiver (Client/Garage)
    
    S->>UI: Type message, click send
    UI->>API: POST /api/chat/{requestId}/messages<br/>{message, senderId, senderType, garageId}
    
    API->>DB: Query Sender (Client/Garage) table<br/>Get sender name
    DB-->>API: Return sender data
    
    API->>DB: Create ChatMessage record
    DB-->>API: Confirm message saved
    
    API->>AS: Publish event to channel<br/>request-{requestId}-garage-{garageId}
    AS->>R: Broadcast message (real-time)
    
    API-->>UI: Return {success: true, message: {...}}
    UI->>S: Show message in chat
    
    R->>R: Display message in chat (real-time)
```

### Chat Message Data Structure

**ChatMessage (DynamoDB):**
```json
{
  "id": "msg-timestamp-random",
  "requestId": "sr-...",
  "senderId": "client-...",
  "senderType": "client",
  "senderName": "John Doe",
  "message": "Hello, when can you start?",
  "timestamp": "2024-12-25T10:00:00Z",
  "garageId": "garage-...",
  "createdAt": "2024-12-25T10:00:00Z"
}
```

## Registration with Vehicle Deduplication Flow

### Data Flow

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Registration UI
    participant API as Register API
    participant DB as DynamoDB
    participant LS as localStorage
    
    U->>UI: Fill registration form<br/>{email, firstName, lastName, phone}
    UI->>LS: Get pendingRegistrationData
    
    UI->>API: POST /api/auth/register-from-requests<br/>{guestClientId, email, firstName, lastName, phone, vehicleData}
    
    API->>DB: Query Clients table by email
    DB-->>API: Return existing client (if found)
    
    alt Email Exists
        API->>DB: Query Vehicles for existing client<br/>by VIN or Engine Number
        DB-->>API: Return matching vehicle (if found)
        
        alt Vehicle Match Found
            API->>DB: Link guest request to existing vehicle
            API->>DB: Update ServiceRequest clientId<br/>to existing client
            API->>DB: Delete guest client (if no other requests)
        else No Vehicle Match
            API->>DB: Create new vehicle for existing client
            API->>DB: Update ServiceRequest clientId
        end
    else Email Not Exists
        API->>DB: Update guest client with email
        API->>DB: Mark as registered
    end
    
    API-->>UI: Return {success: true, client: {...}, vehicleDeduplicated: true}
    UI->>LS: Update clientId
    UI->>LS: Clear pendingRegistrationData
    UI->>U: Redirect to /requests/{clientId}
```

## Photo Upload Flow

### Data Flow

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Photo Upload UI
    participant API as Upload API
    participant S3 as S3 Bucket
    participant DB as DynamoDB
    
    U->>UI: Select photos
    UI->>API: POST /api/upload-photos<br/>FormData with files
    
    loop For each photo
        API->>S3: Upload file
        S3-->>API: Return S3 URL and key
        API->>DB: Store photo metadata (optional)
    end
    
    API-->>UI: Return {success: true, photos: [{s3Url, s3Key, ...}]}
    UI->>UI: Display uploaded photos
    UI->>LS: Save photo URLs to form data
```

### Photo Metadata Structure

```json
{
  "id": "photo-timestamp-random",
  "s3Url": "https://bucket.s3.amazonaws.com/key",
  "s3Key": "uploads/request-id/photo.jpg",
  "originalName": "photo.jpg",
  "fileSize": 123456,
  "contentType": "image/jpeg",
  "description": "Front view",
  "uploadedAt": "2024-12-25T10:00:00Z"
}
```

## Price Estimation Flow

### Data Flow

```mermaid
sequenceDiagram
    participant UI as Car Specs Form
    participant API as Price Estimation API
    participant Logic as Estimation Logic
    
    UI->>API: POST /api/price-estimation<br/>{category, brand, model, modelYear, engineCC, fuelType, isAutomatic, is4x4}
    
    API->>Logic: Calculate estimated price
    Note over Logic: Base price by category<br/>+ Adjustments for:<br/>- Year<br/>- Engine size<br/>- Fuel type<br/>- Transmission<br/>- 4x4<br/>+ Market variation
    
    Logic-->>API: Return {estimatedCost, confidence, basedOnSimilarCars}
    API-->>UI: Return estimation
    
    UI->>UI: Display estimated price
    UI->>LS: Save estimatedPrice to form data
```

### Price Estimation Data

**Request:**
```json
{
  "category": "service",
  "brand": "toyota",
  "model": "Corolla",
  "modelYear": "2020",
  "engineCC": "1800",
  "fuelType": "petrol",
  "isAutomatic": false,
  "is4x4": false
}
```

**Response:**
```json
{
  "success": true,
  "estimation": {
    "estimatedCost": 150,
    "currency": "EUR",
    "confidence": "high",
    "basedOnSimilarCars": 20,
    "category": "service"
  }
}
```

## Data Query Patterns

### Client Requests Query

**API:** `GET /api/requests?clientId={clientId}`

**DynamoDB Query:**
```typescript
ScanCommand({
  TableName: 'ServiceRequests',
  FilterExpression: 'clientId = :clientId',
  ExpressionAttributeValues: {
    ':clientId': clientId
  }
})
```

**Then for each request:**
- Query Vehicles table for vehicle details
- Query Offers table for offers
- Query ChatMessages for unread count

### Available Requests Query (Garage)

**API:** `GET /api/garage/available-requests?garageId={garageId}`

**DynamoDB Query:**
```typescript
// Get all pending/in-progress requests
ScanCommand({
  TableName: 'ServiceRequests',
  FilterExpression: 'status IN (:pending, :inProgress)',
  ExpressionAttributeValues: {
    ':pending': 'pending',
    ':inProgress': 'in-progress'
  }
})

// Filter out requests where garage already made offer
// Query Offers table for garageId + serviceRequestId
```

### Chat Messages Query

**API:** `GET /api/chat/{requestId}/messages?garageId={garageId}`

**DynamoDB Query:**
```typescript
ScanCommand({
  TableName: 'ChatMessages',
  FilterExpression: 'requestId = :requestId AND (senderId = :garageId OR (senderType = :clientType AND garageId = :garageId))',
  ExpressionAttributeValues: {
    ':requestId': requestId,
    ':garageId': garageId,
    ':clientType': 'client'
  }
})
```

## Data Synchronization

### Real-time Updates

**AppSync Channels:**
- `request-{requestId}-garage-{garageId}` - Chat messages

**Update Flow:**
1. Data change in DynamoDB
2. API publishes event to AppSync
3. AppSync broadcasts to subscribed clients
4. UI updates in real-time

### Polling Fallback

**If AppSync unavailable:**
- Components can poll API endpoints
- Refresh on user interaction
- Periodic background refresh

## Data Validation

### Client-Side Validation

**Form Validation:**
- Required fields
- Format validation (email, phone, VIN)
- File size/type for uploads

**Storage:** Form data in `localStorage` until submission

### Server-Side Validation

**API Validation:**
- Required fields
- Data types
- Business rules (status transitions)
- Authorization checks

**Storage:** Validated data in DynamoDB

## Error Handling

### Data Flow Errors

**Network Errors:**
- Retry logic
- Error messages to user
- Fallback to cached data

**Validation Errors:**
- Clear error messages
- Highlight invalid fields
- Prevent invalid submissions

**Database Errors:**
- Transaction rollback (if implemented)
- Error logging
- User-friendly error messages

## Key Files

**API Routes:**
- `src/app/api/service-request/route.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/register-from-requests/route.ts`
- `src/app/api/offers/route.ts`
- `src/app/api/requests/[requestId]/accept-offer/route.ts`
- `src/app/api/chat/[requestId]/messages/route.ts`

**Services:**
- `src/utils/dynamoService.ts`
- `src/utils/s3Service.ts`
- `src/lib/appsync-service.ts`
- `src/utils/formStorage.ts`

**Components:**
- `src/app/requests/components/RequestsPage.tsx`
- `src/app/garage-dashboard/[garageId]/components/AvailableRequests.tsx`
- `src/contexts/UserContext.tsx`

## Performance Considerations

### Data Loading

**Optimization Strategies:**
- Lazy loading of request details
- Pagination for long lists
- Caching frequently accessed data
- Batch queries where possible

### Real-time Updates

**Efficiency:**
- Single WebSocket connection
- Channel-based subscriptions
- Message deduplication
- Efficient reconnection logic

### Storage Optimization

**localStorage:**
- Clean up old form data
- Limit stored data size
- Clear on logout

**DynamoDB:**
- Efficient query patterns
- Index optimization
- Data archiving for old records



