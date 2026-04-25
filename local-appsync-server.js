#!/usr/bin/env node

// Simple AppSync Events Mock Server for Local Development
// This simulates AWS AppSync Events locally - 100% compatible with your existing code

const WebSocket = require('ws');
const express = require('express');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ 
  server,
  path: '/graphql'  // AppSync WebSocket path
});

// Store active connections and subscriptions
const connections = new Map();
const subscriptions = new Map();

console.log('🚀 Starting Local AppSync Events Server...');

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  const connectionId = `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  connections.set(connectionId, ws);
  
  console.log(`✅ Client connected: ${connectionId}`);
  
  // Send AppSync connection acknowledgment
  ws.send(JSON.stringify({
    type: 'connection_ack',
    payload: {
      connectionTimeoutMs: 300000
    }
  }));
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleMessage(connectionId, data);
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log(`❌ Client disconnected: ${connectionId}`);
    connections.delete(connectionId);
    // Clean up subscriptions
    for (const [roomId, subs] of subscriptions.entries()) {
      subscriptions.set(roomId, subs.filter(id => id !== connectionId));
    }
  });
});

function handleMessage(connectionId, data) {
  console.log(`📨 Message from ${connectionId}:`, data.type);
  
  switch (data.type) {
    case 'start':
      // AppSync subscription start
      console.log(`📨 START message from ${connectionId}:`, data.payload?.data);
      if (data.payload && data.payload.data) {
        const roomId = extractRoomId(data.payload.data);
        console.log(`📨 Extracted room ID: ${roomId}`);
        if (roomId) {
          subscribeToRoom(connectionId, roomId);
          // Send subscription confirmation
          const ws = connections.get(connectionId);
          if (ws) {
            const confirmation = {
              type: 'data',
              id: data.id,
              payload: {
                data: {
                  subscribe: {
                    roomId: roomId,
                    status: 'subscribed'
                  }
                }
              }
            };
            console.log(`📨 Sending confirmation:`, confirmation);
            ws.send(JSON.stringify(confirmation));
          }
        } else {
          console.log(`❌ Could not extract room ID from: ${data.payload.data}`);
          // Send error response
          const ws = connections.get(connectionId);
          if (ws) {
            const errorResponse = {
              type: 'error',
              id: data.id,
              error: 'Could not extract room ID'
            };
            console.log(`❌ Sending error response:`, errorResponse);
            ws.send(JSON.stringify(errorResponse));
          }
        }
      } else {
        console.log(`❌ Invalid START message format from ${connectionId}`);
      }
      break;
      
    case 'stop':
      // AppSync subscription stop
      if (data.payload && data.payload.data) {
        const roomId = extractRoomId(data.payload.data);
        if (roomId) {
          unsubscribeFromRoom(connectionId, roomId);
        }
      }
      break;
      
    case 'publish':
      // Custom publish message (for testing)
      if (data.roomId && data.message) {
        publishToRoom(data.roomId, data.message);
      }
      break;
      
    default:
      console.log('Unknown message type:', data.type);
  }
}

function extractRoomId(data) {
  // Accept any non-empty string as a room/channel id. Used by both chat
  // (`request-<requestId>-garage-<garageId>`) and the new-request broadcast
  // channels (`new-requests`, `request-updates`).
  if (typeof data === 'string' && data.length > 0) {
    return data;
  }
  return null;
}

function subscribeToRoom(connectionId, roomId) {
  if (!subscriptions.has(roomId)) {
    subscriptions.set(roomId, []);
  }
  subscriptions.get(roomId).push(connectionId);
  console.log(`📡 ${connectionId} subscribed to ${roomId}`);
}

function unsubscribeFromRoom(connectionId, roomId) {
  if (subscriptions.has(roomId)) {
    const subs = subscriptions.get(roomId);
    const index = subs.indexOf(connectionId);
    if (index > -1) {
      subs.splice(index, 1);
    }
    console.log(`📡 ${connectionId} unsubscribed from ${roomId}`);
  }
}

function publishToRoom(roomId, message) {
  console.log(`📤 Publishing to ${roomId}:`, message);

  if (subscriptions.has(roomId)) {
    const subs = subscriptions.get(roomId);
    subs.forEach(connectionId => {
      const ws = connections.get(connectionId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        // Include channelName so the client can route the event to the
        // correct subscriber instead of broadcasting to every callback.
        ws.send(JSON.stringify({
          type: 'data',
          payload: {
            channelName: roomId,
            data: {
              subscribe: message
            }
          }
        }));
      }
    });
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    connections: connections.size,
    subscriptions: subscriptions.size,
    timestamp: new Date().toISOString()
  });
});

// Test endpoint to publish messages
app.post('/publish', express.json(), (req, res) => {
  const { roomId, message } = req.body;
  if (roomId && message) {
    publishToRoom(roomId, message);
    res.json({ success: true, roomId, message });
  } else {
    res.status(400).json({ error: 'roomId and message required' });
  }
});

const PORT = 3002;
server.listen(PORT, () => {
  console.log(`🚀 Local AppSync Events Server running on port ${PORT}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}/graphql`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`📤 Test publish: POST http://localhost:${PORT}/publish`);
  console.log('');
  console.log('💡 This server simulates AWS AppSync Events for local development');
  console.log('   Your app will connect to this instead of AWS when NODE_ENV=development');
});
