# Local Development Setup

This guide explains how to run all local services for development.

## Prerequisites

- Java (for DynamoDB Local)
- Node.js and npm

## Available Scripts

### Option 1: Run All Services at Once (Recommended)

```bash
npm run services
```

This starts:
- 📊 **DynamoDB Local** on port `8000`
- 🌐 **DynamoDB Admin UI** on port `8001`
- 📡 **AppSync Mock Server** on port `3002`

Then in a **separate terminal**, run:
```bash
npm run dev
```

This starts the Next.js development server on port `3000`.

### Option 2: Run Everything Including Next.js

```bash
npm run dev:all
```

This runs all services AND the Next.js dev server in one command.

### Option 3: Individual Services

Run services individually if needed:

```bash
# DynamoDB Local + Admin UI only
npm run dynamodb
# or
./start-dynamodb.sh

# AppSync Mock Server only
npm run mock-appsync
# or
node local-appsync-server.js

# Next.js dev server only
npm run dev
```

## Service Endpoints

Once running, you can access:

| Service | URL | Description |
|---------|-----|-------------|
| Next.js App | http://localhost:3000 | Your application |
| DynamoDB Local | http://localhost:8000 | DynamoDB API endpoint |
| DynamoDB Admin UI | http://localhost:8001 | Database web interface |
| AppSync Mock | ws://localhost:3002/graphql | WebSocket endpoint |
| AppSync Health | http://localhost:3002/health | Health check endpoint |

## Stopping Services

Press `Ctrl+C` in the terminal where services are running. The cleanup handlers will automatically stop all background processes.

## Troubleshooting

### Port Already in Use

If you see port conflict errors:
```bash
# Check what's using the port (e.g., port 8000)
lsof -i :8000

# Kill the process
kill -9 <PID>
```

### DynamoDB Not Starting

Ensure Java is installed:
```bash
java -version
```

### Services Not Stopping Cleanly

If services don't stop with Ctrl+C:
```bash
# Find and kill processes manually
pkill -f DynamoDBLocal
pkill -f dynamodb-admin
pkill -f local-appsync-server
```

## Development Workflow

**Recommended workflow:**

1. Start all backend services in one terminal:
   ```bash
   npm run services
   ```

2. Keep your Next.js dev server running in another terminal (as you mentioned you always do):
   ```bash
   npm run dev
   ```

3. Access the admin UI at http://localhost:8001 to inspect/modify database
4. Your app will use the local AppSync mock for real-time features
5. All changes to Next.js code will hot-reload automatically

## Environment Variables

Make sure your `.env.local` (or environment) is configured to use local endpoints:
- DynamoDB endpoint should point to `http://localhost:8000`
- AppSync should use the local WebSocket at `ws://localhost:3002/graphql`

