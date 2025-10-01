// WebSocket service for real-time chat using AWS AppSync
import { Amplify } from 'aws-amplify';

interface ChatMessage {
  id: string
  requestId: string
  senderId: string
  senderType: 'client' | 'garage'
  senderName: string
  message: string
  timestamp: string
  garageId?: string
}

class WebSocketService {
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, (message: ChatMessage) => void> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    // Use local mock in development, AWS AppSync in production
    const isLocal = process.env.NODE_ENV === 'development';
    const wsUrl = isLocal 
      ? 'ws://localhost:3002/graphql'  // Local mock server
      : process.env.NEXT_PUBLIC_APPSYNC_WEBSOCKET_ENDPOINT;  // AWS AppSync
    
    if (!wsUrl) {
      console.error('WebSocket endpoint not configured');
      return;
    }
    
    console.log(`🔌 Connecting to: ${wsUrl}`);
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket message received:', data);
          
          // Handle AppSync-style messages from our local mock server
          if (data.type === 'data' && data.payload && data.payload.data && data.payload.data.subscribe) {
            const message = data.payload.data.subscribe;
            // Find the callback for this message based on the roomId pattern
            // We need to determine which room this message belongs to
            this.subscriptions.forEach((callback, roomId) => {
              // For now, we'll call all callbacks - in a real implementation,
              // we'd need to match the roomId based on the message content
              callback(message);
            });
          }
          // Handle simple message format (fallback)
          else if (data.type === 'message' && data.roomId) {
            const callback = this.subscriptions.get(data.roomId);
            if (callback) {
              callback(data.message);
            }
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      this.attemptReconnect();
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        this.connect();
      }, this.reconnectDelay * this.reconnectAttempts);
    }
  }

  subscribe(roomId: string, callback: (message: ChatMessage) => void) {
    this.subscriptions.set(roomId, callback);
    
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Send subscription message
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        roomId: roomId
      }));
    }
  }

  unsubscribe(roomId: string) {
    this.subscriptions.delete(roomId);
    
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Send unsubscription message
      this.ws.send(JSON.stringify({
        type: 'unsubscribe',
        roomId: roomId
      }));
    }
  }

  publish(roomId: string, message: ChatMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'message',
        roomId: roomId,
        message: message
      }));
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscriptions.clear();
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();
export default websocketService;
