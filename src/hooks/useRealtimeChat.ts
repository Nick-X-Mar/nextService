import { useEffect, useRef, useState } from 'react';
import websocketService from '@/lib/websocket-service';

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

export const useRealtimeChat = (requestId: string, garageId?: string) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const subscriptionRef = useRef<string | null>(null);

  useEffect(() => {
    // Connect to WebSocket
    websocketService.connect();
    setIsConnected(true);

    // Subscribe to messages if we have a garageId
    if (garageId) {
      const roomId = `chat-${requestId}-${garageId}`;
      subscriptionRef.current = roomId;

      websocketService.subscribe(roomId, (message: ChatMessage) => {
        setMessages(prev => {
          // Check if message already exists (prevent duplicates)
          const exists = prev.some(msg => msg.id === message.id);
          if (exists) return prev;
          
          return [...prev, message];
        });
      });
    }

    return () => {
      // Cleanup subscription
      if (subscriptionRef.current) {
        websocketService.unsubscribe(subscriptionRef.current);
      }
    };
  }, [requestId, garageId]);

  const sendMessage = async (message: ChatMessage) => {
    if (garageId) {
      const roomId = `chat-${requestId}-${garageId}`;
      
      // Publish to WebSocket
      websocketService.publish(roomId, message);
      
      // Add to local state immediately (optimistic update)
      setMessages(prev => [...prev, message]);
    }
  };

  const addMessage = (message: ChatMessage) => {
    setMessages(prev => {
      const exists = prev.some(msg => msg.id === message.id);
      if (exists) return prev;
      return [...prev, message];
    });
  };

  const clearMessages = () => {
    setMessages([]);
  };

  return {
    messages,
    isConnected,
    sendMessage,
    addMessage,
    clearMessages
  };
};
