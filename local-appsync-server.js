#!/usr/bin/env node

// Local stand-in for the AppSync Events API, for development and the E2E suite.
//
// It enforces the same rules as production's Lambda authorizer
// (infra/lambdas/appsync-authorizer): every connection presents a bearer token
// from /api/realtime/token, every subscribe is checked against the channel it
// names, and only the app server's `system` token may publish. The app has no
// API-key fallback any more, so a mock that accepted anything would hide
// exactly the failures production would show.
//
// The process runs the code it was started with: restart it after editing
// this file, or the suite keeps exercising the old rules.

const crypto = require('crypto');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const express = require('express');

// Same env files `next dev` reads, so REALTIME_JWT_SECRET and the DynamoDB
// endpoint match the app without being copied anywhere.
require('@next/env').loadEnvConfig(path.resolve(__dirname), true);

const PORT = Number(process.env.APPSYNC_MOCK_PORT || 3002);
const SECRET = process.env.REALTIME_JWT_SECRET;
const BROADCAST_CHANNELS = new Set(['new-requests', 'request-updates']);

if (!SECRET) {
  console.error('❌ REALTIME_JWT_SECRET is not set (.env.local). Every connection will be refused —');
  console.error('   the app cannot mint realtime tokens without it either.');
}

// ── DynamoDB Local lookups (request owner, garage approval) ─────────────────
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: process.env.REGION || 'eu-central-1',
    endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  })
);

async function requestOwner(requestId) {
  const res = await ddb.send(
    new GetCommand({ TableName: 'ServiceRequests', Key: { id: requestId }, ProjectionExpression: 'clientId' })
  );
  return res.Item ? res.Item.clientId : null;
}

async function isActiveGarage(garageId) {
  const res = await ddb.send(
    new GetCommand({ TableName: 'Garages', Key: { id: garageId }, ProjectionExpression: 'isActive' })
  );
  return !!res.Item && res.Item.isActive === true;
}

// ── Tokens ──────────────────────────────────────────────────────────────────
const b64urlToBuf = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** HS256 verification, mirroring the production authorizer. */
function verifyToken(token) {
  if (!SECRET || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;
  try {
    const header = JSON.parse(b64urlToBuf(headerB64).toString('utf8'));
    if (header.alg !== 'HS256') return null;
    const expected = crypto.createHmac('sha256', SECRET).update(`${headerB64}.${payloadB64}`).digest();
    const provided = b64urlToBuf(signatureB64);
    if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) return null;
    const payload = JSON.parse(b64urlToBuf(payloadB64).toString('utf8'));
    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (payload.aud !== 'appsync-events') return null;
    if (!payload.userId || !payload.userType) return null;
    return payload;
  } catch {
    return null;
  }
}

function bearer(value) {
  if (typeof value !== 'string') return null;
  return value.startsWith('Bearer ') ? value.slice(7) : value;
}

/** `header-<base64url JSON>` subprotocol → the Authorization it carries. */
function tokenFromProtocols(protocolHeader) {
  for (const protocol of String(protocolHeader || '').split(',').map((p) => p.trim())) {
    if (!protocol.startsWith('header-')) continue;
    try {
      const auth = JSON.parse(b64urlToBuf(protocol.slice('header-'.length)).toString('utf8'));
      return bearer(auth.Authorization || auth.authorization);
    } catch {
      return null;
    }
  }
  return null;
}

/** `/default/<name>` or a bare `<name>` → `<name>`; wildcards and other namespaces → null. */
function channelName(channel) {
  if (typeof channel !== 'string') return null;
  const segments = channel.split('/').filter(Boolean);
  const name =
    segments.length === 2 && segments[0] === 'default' ? segments[1]
      : segments.length === 1 ? segments[0]
        : null;
  if (!name || name.includes('*')) return null;
  return name;
}

async function maySubscribe(claims, name) {
  if (BROADCAST_CHANNELS.has(name)) {
    return claims.userType === 'garage' && (await isActiveGarage(claims.userId));
  }
  const match = /^request-(.+?)-garage-(.+)$/.exec(name);
  if (!match) return false;
  const [, requestId, garageId] = match;
  // A deactivated garage keeps a valid token for its 15-minute life; its own
  // threads carry client messages, so they need the same approval check.
  if (claims.userType === 'garage') return garageId === claims.userId && (await isActiveGarage(claims.userId));
  if (claims.userType === 'client') return (await requestOwner(requestId)) === claims.userId;
  return false;
}

/**
 * The same decisions the Lambda authorizer makes, per operation:
 * CONNECT needs a valid token, PUBLISH needs the app server's `system` token,
 * SUBSCRIBE goes by the channel. A subscribe or publish without a channel is
 * refused.
 */
async function authorize(claims, operation, channel) {
  if (!claims) return false;
  if (operation === 'CONNECT') return true;
  const name = channelName(channel);
  if (!name) return false;
  if (operation === 'PUBLISH') return claims.userType === 'system';
  if (operation === 'SUBSCRIBE') return maySubscribe(claims, name);
  return false;
}

// ── Server ──────────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({
  server,
  path: '/graphql',
  // Pick the AppSync subprotocol the client offers; the credential protocol
  // is read, not selected.
  handleProtocols: (protocols) => (protocols.has('aws-appsync-event-ws') ? 'aws-appsync-event-ws' : false),
  verifyClient: (info, done) => {
    const claims = verifyToken(tokenFromProtocols(info.req.headers['sec-websocket-protocol']));
    if (!claims) {
      console.log('🚫 Connection refused: missing or invalid realtime token');
      return done(false, 401, 'Unauthorized');
    }
    info.req.claims = claims;
    done(true);
  },
});

const connections = new Map(); // connectionId → { ws, claims, subIds: roomId → subscribe-frame id }
const subscriptions = new Map(); // roomId → connectionId[]

console.log('🚀 Starting Local AppSync Events Server...');

wss.on('connection', (ws, req) => {
  const connectionId = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  connections.set(connectionId, { ws, claims: req.claims, subIds: new Map() });
  console.log(`✅ Client connected: ${connectionId} (${req.claims.userType} ${req.claims.userId})`);

  ws.send(JSON.stringify({ type: 'connection_ack', payload: { connectionTimeoutMs: 300000 } }));

  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (error) {
      console.error('Error parsing message:', error);
      return;
    }
    handleMessage(connectionId, data).catch((err) => console.error('Error handling message:', err));
  });

  ws.on('close', () => {
    connections.delete(connectionId);
    for (const [roomId, subs] of subscriptions.entries()) {
      subscriptions.set(roomId, subs.filter((id) => id !== connectionId));
    }
  });
});

/** A frame may carry its own (fresher) token; otherwise the connection's applies. */
function frameClaims(connectionId, data) {
  const frameToken = data && data.authorization ? bearer(data.authorization.Authorization) : null;
  if (frameToken) return verifyToken(frameToken);
  const conn = connections.get(connectionId);
  return conn ? conn.claims : null;
}

function reply(connectionId, payload) {
  const conn = connections.get(connectionId);
  if (conn && conn.ws.readyState === WebSocket.OPEN) conn.ws.send(JSON.stringify(payload));
}

async function handleMessage(connectionId, data) {
  switch (data.type) {
    case 'start': {
      const requested = data.payload?.data;
      // A subscribe that names no channel is refused like any other.
      if (!(await authorize(frameClaims(connectionId, data), 'SUBSCRIBE', requested).catch(() => false))) {
        console.log(`🚫 ${connectionId} denied subscribe to ${requested}`);
        reply(connectionId, { type: 'subscribe_error', id: data.id, errors: [{ errorType: 'UnauthorizedException' }] });
        return;
      }
      const roomId = channelName(requested);
      subscribeToRoom(connectionId, roomId);
      // Remembered so data frames can be addressed the way AWS addresses them.
      connections.get(connectionId)?.subIds.set(roomId, data.id);
      reply(connectionId, {
        type: 'data',
        id: data.id,
        payload: { data: { subscribe: { roomId, status: 'subscribed' } } },
      });
      return;
    }

    case 'stop': {
      const roomId = channelName(data.payload?.data);
      if (roomId) {
        unsubscribeFromRoom(connectionId, roomId);
        connections.get(connectionId)?.subIds.delete(roomId);
      }
      return;
    }

    case 'publish': {
      // Judged before the payload is looked at: a publish that names no
      // channel is refused like any other, not silently dropped.
      if (!(await authorize(frameClaims(connectionId, data), 'PUBLISH', data.roomId).catch(() => false))) {
        console.log(`🚫 ${connectionId} denied publish to ${data.roomId}`);
        reply(connectionId, { type: 'publish_error', id: data.id, errors: [{ errorType: 'UnauthorizedException' }] });
        return;
      }
      if (!data.message) return;
      publishToRoom(channelName(data.roomId), data.message);
      return;
    }

    default:
      console.log('Unknown message type:', data.type);
  }
}

function subscribeToRoom(connectionId, roomId) {
  if (!subscriptions.has(roomId)) subscriptions.set(roomId, []);
  const subs = subscriptions.get(roomId);
  if (!subs.includes(connectionId)) subs.push(connectionId);
  console.log(`📡 ${connectionId} subscribed to ${roomId}`);
}

function unsubscribeFromRoom(connectionId, roomId) {
  const subs = subscriptions.get(roomId);
  if (!subs) return;
  const index = subs.indexOf(connectionId);
  if (index > -1) subs.splice(index, 1);
}

function publishToRoom(roomId, message) {
  console.log(`📤 Publishing to ${roomId}`);
  for (const connectionId of subscriptions.get(roomId) || []) {
    // The same frame AWS AppSync Events sends: addressed by the id of the
    // subscribe frame, with the event JSON-encoded and no channel name. The
    // mock used to add `channelName`, which AWS never does, so the browser's
    // routing was only ever exercised on a shape production doesn't produce.
    const subId = connections.get(connectionId)?.subIds.get(roomId);
    reply(connectionId, { type: 'data', id: subId, event: JSON.stringify(message) });
  }
}

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    connections: connections.size,
    subscriptions: subscriptions.size,
    authorizer: SECRET ? 'enforced' : 'no REALTIME_JWT_SECRET — refusing all connections',
    timestamp: new Date().toISOString(),
  });
});

// Stands in for AppSync's HTTP `POST /event`, which the app's server publishes
// to with a `system` token (src/lib/appsync-publish.ts). A token that is
// present must verify and be the system's, exactly as in AWS — a garage or
// client token is refused here as it is on the socket.
// Tokenless publishes are still accepted as a local test hook only (the E2E
// suite cannot mint a system token without the signing secret). Nothing in
// the app relies on that, browsers cannot reach it (no CORS), and AppSync
// itself has no such door.
app.post('/publish', express.json(), async (req, res) => {
  const { roomId, message } = req.body || {};
  if (!roomId || !message) {
    return res.status(400).json({ error: 'roomId and message required' });
  }
  const token = bearer(req.headers.authorization);
  if (token && !(await authorize(verifyToken(token), 'PUBLISH', roomId).catch(() => false))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const name = channelName(roomId);
  if (!name) return res.status(400).json({ error: 'Unknown channel' });
  publishToRoom(name, message);
  res.json({ success: true, roomId: name });
});

server.listen(PORT, () => {
  console.log(`🚀 Local AppSync Events Server running on port ${PORT}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}/graphql (bearer token required)`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});
