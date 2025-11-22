# NextService Flow Documentation

## Overview

This directory contains comprehensive flow diagrams and documentation for the NextService application, covering all user types, interactions, and system processes.

## Documentation Files

### 1. [Overview](./overview.md)
High-level system architecture and entry points for all user types.

**Contents:**
- System entry points
- User type overview
- Communication architecture
- Key API endpoints
- Links to detailed flows

### 2. [Guest User Flow](./guest-user-flow.md)
Complete flow for unauthenticated users creating service requests.

**Contents:**
- Landing page to request creation
- Form data persistence
- Vehicle and client creation
- Registration prompts
- Data deduplication

### 3. [Client Flow](./client-flow.md)
Complete flow for authenticated clients managing requests.

**Contents:**
- Login and registration
- Request management
- Chat with garages
- Offer acceptance
- User context management

### 4. [Garage Flow](./garage-flow.md)
Complete flow for professional service providers.

**Contents:**
- Garage login and registration
- Dashboard navigation
- Viewing available requests
- Creating offers
- Chat with clients

### 5. [Communication Flow](./communication-flow.md)
Real-time communication architecture and messaging.

**Contents:**
- AppSync WebSocket architecture
- Chat message flow
- Channel naming conventions
- Read/unread status
- Notification system (current and future)

### 6. [State Diagram](./state-diagram.md)
Service request status transitions and state machine.

**Contents:**
- All possible statuses
- Valid state transitions
- Status-based behavior (chat, offers)
- UI representation
- Business rules

### 7. [Data Flow](./data-flow.md)
Complete data flow through the application.

**Contents:**
- Service request creation
- Authentication flow
- Offer creation and acceptance
- Chat messaging
- Photo uploads
- Price estimation
- Database query patterns

## Quick Reference

### User Types

| User Type | Entry Point | Main Flow |
|-----------|-------------|-----------|
| **Guest User** | Landing Page (`/`) | [Guest User Flow](./guest-user-flow.md) |
| **Client** | Login Page (`/login`) | [Client Flow](./client-flow.md) |
| **Garage** | Login Page (`/login`) | [Garage Flow](./garage-flow.md) |

### Key Flows

1. **Creating a Service Request**
   - Start: [Guest User Flow](./guest-user-flow.md) - Landing Page
   - End: Requests Page with created request

2. **Accepting an Offer**
   - Start: [Client Flow](./client-flow.md) - Request Details
   - Process: [State Diagram](./state-diagram.md) - Status Transition
   - Data: [Data Flow](./data-flow.md) - Offer Acceptance

3. **Real-time Chat**
   - Architecture: [Communication Flow](./communication-flow.md)
   - Implementation: [Data Flow](./data-flow.md) - Chat Message Flow

4. **Garage Making Offer**
   - Start: [Garage Flow](./garage-flow.md) - Available Requests
   - Process: [Data Flow](./data-flow.md) - Offer Creation

## Diagram Types

All diagrams use **Mermaid** syntax and can be rendered in:
- GitHub (native support)
- Markdown viewers with Mermaid support
- VS Code with Mermaid extensions
- Online Mermaid editors

## Navigation Guide

### For Understanding User Journeys
1. Start with [Overview](./overview.md) for high-level understanding
2. Read specific user flow based on role:
   - Guest users → [Guest User Flow](./guest-user-flow.md)
   - Clients → [Client Flow](./client-flow.md)
   - Garages → [Garage Flow](./garage-flow.md)

### For Understanding System Behavior
1. [State Diagram](./state-diagram.md) - How request statuses change
2. [Communication Flow](./communication-flow.md) - How real-time messaging works
3. [Data Flow](./data-flow.md) - How data moves through the system

### For Development
1. [Data Flow](./data-flow.md) - API endpoints and data structures
2. [State Diagram](./state-diagram.md) - Business rules and validations
3. [Communication Flow](./communication-flow.md) - Real-time implementation details

## Key Concepts

### Session Management
- **Clients:** `clientId` in `localStorage`
- **Garages:** `garageId` in `localStorage`
- **User Context:** React Context API for client state

### Real-time Communication
- **Technology:** AWS AppSync WebSocket
- **Channel Format:** `request-{requestId}-garage-{garageId}`
- **Message Storage:** DynamoDB ChatMessages table

### Data Persistence
- **Form Data:** `localStorage` via `formStorage` utility
- **User Data:** DynamoDB (Clients, Garages tables)
- **Requests:** DynamoDB (ServiceRequests table)
- **Offers:** DynamoDB (Offers table)
- **Messages:** DynamoDB (ChatMessages table)
- **Photos:** S3 Bucket

### Status Lifecycle
1. **pending** → Created, awaiting offers
2. **appointment** → Offer accepted, scheduled
3. **in-progress** → Work started
4. **completed** → Work finished
5. **cancelled** → Request cancelled

See [State Diagram](./state-diagram.md) for details.

## Related Documentation

- [Database Schema](../databases/dynamodb.md) - DynamoDB table structures
- [Environment Setup](../environment-setup.md) - Configuration
- [AWS Setup](../aws-manual-setup.md) - AWS services configuration

## Updates

This documentation reflects the current state of the application as of the last update. When making changes to flows:

1. Update the relevant flow document
2. Update this README if structure changes
3. Update [Overview](./overview.md) if entry points change
4. Update [State Diagram](./state-diagram.md) if statuses change

## Questions?

Refer to the specific flow document for detailed information, or check the code references in each document for implementation details.



