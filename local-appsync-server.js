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
      if (data.payload && data.payload.data) {
        const roomId = extractRoomId(data.payload.data);
        if (roomId) {
          subscribeToRoom(connectionId, roomId);
          // Send subscription confirmation
          const ws = connections.get(connectionId);
          if (ws) {
            ws.send(JSON.stringify({
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
            }));
          }
        }
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
  // Extract room ID from AppSync subscription data
  // This matches your room naming: chat-${requestId}-${garageId}
  if (typeof data === 'string') {
    const match = data.match(/chat-([^-]+)-([^-]+)/);
    return match ? match[0] : null;
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
        // Send in AppSync format
        ws.send(JSON.stringify({
          type: 'data',
          payload: {
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
