# NextService Documentation

This directory contains comprehensive documentation for the NextService application.

## 📁 Directory Structure

```
docs/
├── README.md                 # This file - documentation overview
└── databases/
    └── dynamodb.md          # DynamoDB schema and database documentation
```

## 📚 Available Documentation

### Database Documentation

- **[DynamoDB Schema](./databases/dynamodb.md)** - Complete database schema documentation including:
  - Table structures and relationships
  - Field definitions and data types
  - Global Secondary Indexes (GSI)
  - Sample data and query patterns
  - Development setup instructions
  - Best practices and future enhancements

## 🚀 Quick Start

1. **Database Setup**: Follow the [DynamoDB documentation](./databases/dynamodb.md) to set up your local development environment
2. **Schema Overview**: Review the table relationships and data structures
3. **Query Examples**: Use the provided query patterns for common operations

## 🔧 Development

### Local Development

- **DynamoDB Local**: `http://localhost:8000`
- **DynamoDB Admin GUI**: `http://localhost:8001`
- **AWS CLI**: Use `--endpoint-url http://localhost:8000`

### Environment Setup

```bash
# Local Development
AWS_ACCESS_KEY_ID=dummy
AWS_SECRET_ACCESS_KEY=dummy
AWS_REGION=us-east-1
DYNAMODB_ENDPOINT=http://localhost:8000
```

## 📊 Database Schema Overview

The NextService database consists of 5 main tables:

1. **Clients** - User/client information
2. **Vehicles** - Vehicle information linked to clients
3. **ServiceRequests** - Service requests made by clients
4. **Garages** - Garage/service provider information
5. **Offers** - Offers made by garages for service requests

## 🔗 Key Relationships

- Clients can have multiple Vehicles
- Clients can make multiple ServiceRequests
- Vehicles can have multiple ServiceRequests
- ServiceRequests can receive multiple Offers
- Garages can make multiple Offers

## 📝 Contributing

When making changes to the database schema:

1. Update the relevant documentation in `databases/dynamodb.md`
2. Update this README if adding new documentation sections
3. Test all changes with the local DynamoDB setup
4. Update sample data and query examples as needed

## 📞 Support

For questions about the database schema or documentation, please refer to the detailed documentation in the `databases/` folder or contact the development team.

---

*Last Updated: September 24, 2024*
*Version: 1.0*
