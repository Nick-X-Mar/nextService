# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NextService is a Greek car service marketplace web app connecting vehicle owners (clients) with garages (professionals). Clients submit service requests with vehicle details and photos; garages view, chat, and provide offers. Built with Next.js 15 App Router, TypeScript, Tailwind CSS, AWS DynamoDB, S3, and AppSync (real-time WebSocket chat).

## Commands

- `npm run dev` — start Next.js dev server (usually already running on localhost:3000)
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run dev:full` — dev server + local AppSync mock server (WebSocket)
- `npm run dev:all` — dev server + all local services (DynamoDB, AppSync mock)
- `npm run dynamodb` — start local DynamoDB
- `npm run mock-appsync` — start local AppSync WebSocket mock (`local-appsync-server.js`)

No test framework is configured. Do not create test files.

## Architecture

### Backend (API Routes)

Server-side API routes in `src/app/api/` — Next.js Route Handlers that talk to DynamoDB and S3 directly:
- `auth/` — client/garage login and registration
- `service-request/` — CRUD for service requests
- `offers/` — garage offer management
- `chat/` — chat messages (persisted in DynamoDB, real-time via AppSync)
- `upload-photos/`, `upload/` — S3 photo uploads
- `garage/`, `clients/`, `vehicles/`, `requests/` — entity CRUD

### Frontend (App Router Pages)

Each page follows the pattern: `src/app/<page-name>/page.tsx` with a `components/` subfolder for page-specific components.

Key routes:
- `landing-page/` — public homepage
- `login/` — client and garage auth
- `car-specifications/` — multi-step vehicle + service request form
- `requests/` — client views their service requests
- `garage-dashboard/[garageId]/` — garage portal (requests, chats, appointments)
- `register-professional/` — garage registration
- `profile/` — user profile management

### Shared Code

- `src/components/` — reusable UI components (Button, Modal, Card, Input, Badge, Switch, etc.). Always use these instead of creating one-off equivalents.
- `src/contexts/AuthContext.tsx` — auth state (client vs garage user types), persisted to localStorage
- `src/contexts/UserContext.tsx` — user-level state
- `src/utils/dynamoService.ts` — DynamoDB client factory (auto-detects local vs AWS credentials vs IAM role)
- `src/utils/s3Service.ts` — S3 upload helpers
- `src/utils/formStorage.ts` — localStorage persistence for multi-step forms
- `src/lib/amplify-config.ts` — AWS Amplify/AppSync initialization
- `src/lib/websocket-service.ts` — WebSocket client for real-time chat
- `src/hooks/useRealtimeChat.ts` — React hook for real-time chat via AppSync
- `src/types/` — shared TypeScript types (`ServiceRequest`, `ServiceRequestStatus`, etc.)

### Two User Types

The app has two distinct user roles with separate UIs:
- **Client** — submits service requests, views offers, chats with garages
- **Garage** — views incoming requests, sends offers, chats with clients, manages appointments

Auth state determines which navigation (`ClientNavigation` vs `GarageNavigation`) and dashboard is shown.

### Real-time Chat

Chat uses a dual approach: REST API routes for persistence (DynamoDB) and AppSync WebSocket for real-time delivery. The local mock server (`local-appsync-server.js`) simulates AppSync during development.

## Environment

Key env vars (in `.env.local`):
- `REGION`, `DYNAMODB_ENDPOINT` — AWS/DynamoDB config
- `S3_BUCKET_NAME` — photo storage bucket
- `NEXT_PUBLIC_APPSYNC_*` — AppSync endpoint, API key, region
- `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY` — explicit AWS creds (optional; IAM role used in prod)

Path alias: `@/` maps to `src/`.

## Rules

- **NEVER commit automatically.** Only commit when the user explicitly asks for it.
- Do not start the dev server — it is always running on localhost:3000.
- Clean up any temporary/test/debug files before completing work.
- Use existing shared components from `src/components/` rather than creating duplicates.
- Follow the page structure convention: `src/app/<page-name>/page.tsx` + `components/` subfolder.
- UI text is in Greek (the app targets the Greek market).
