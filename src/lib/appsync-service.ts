// AWS AppSync service for real-time chat
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

class AppSyncService {
  private ws: WebSocket | null = null
  private subscriptions: Map<string, (message: ChatMessage) => void> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private isConnected = false

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const endpoint = process.env.NEXT_PUBLIC_APPSYNC_WEBSOCKET_ENDPOINT
        const apiKey = process.env.NEXT_PUBLIC_APPSYNC_API_KEY
        const graphqlEndpoint = process.env.NEXT_PUBLIC_APPSYNC_GRAPHQL_ENDPOINT
        
        console.log('🔌 AppSync Environment Variables:')
        console.log('  WEBSOCKET_ENDPOINT:', endpoint)
        console.log('  API_KEY:', apiKey ? 'SET' : 'NOT SET')
        console.log('  GRAPHQL_ENDPOINT:', graphqlEndpoint)
        
        if (!endpoint || !apiKey || !graphqlEndpoint) {
          throw new Error('AppSync configuration missing')
        }

        console.log('🔌 Connecting to AppSync Events WebSocket:', endpoint)
        
        // Create authorization object for AppSync Events
        const authorization = { 
          'x-api-key': apiKey, 
          'host': graphqlEndpoint 
        }
        
        // Construct the protocol header for the connection (AWS AppSync Events format)
        const getAuthProtocol = () => {
          const header = btoa(JSON.stringify(authorization))
            .replace(/\+/g, '-') // Convert '+' to '-'
            .replace(/\//g, '_') // Convert '/' to '_'
            .replace(/=+$/, '') // Remove padding '='
          return `header-${header}`
        }
        
        // Use AppSync Events WebSocket endpoint with proper protocol
        const isLocal = endpoint.includes('localhost:3002')
        const wsUrl = isLocal ? endpoint : `${endpoint}/event/realtime`
        console.log('🔌 AppSync Events WebSocket URL:', wsUrl)
        
        // Use the correct WebSocket protocol based on server type
        if (isLocal) {
          // Local server - simple WebSocket connection
          this.ws = new WebSocket(wsUrl)
        } else {
          // AWS AppSync - use proper protocol
          this.ws = new WebSocket(wsUrl, [
            'aws-appsync-event-ws',
            getAuthProtocol(),
          ])
        }
        
        this.ws.onopen = () => {
          console.log('✅ AppSync Events WebSocket connected')
          this.reconnectAttempts = 0
          this.isConnected = true
          resolve()
        }
        
        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            this.handleMessage(data)
          } catch (error) {
            console.error('Error parsing WebSocket message:', error)
          }
        }
        
        this.ws.onclose = (event) => {
          console.log('🔌 AppSync Events WebSocket disconnected:', event.code, event.reason)
          this.isConnected = false
          // Don't auto-reconnect on connection errors to avoid loops
          if (event.code !== 1000 && event.code !== 1006) {
            this.handleReconnect()
          }
        }
        
        this.ws.onerror = (error) => {
          console.error('❌ AppSync Events WebSocket error:', error)
          this.isConnected = false
          reject(error)
        }
        
      } catch (error) {
        console.error('Error connecting to AppSync Events WebSocket:', error)
        reject(error)
      }
    })
  }

  private handleMessage(data: any) {
    console.log('📨 AppSync Events WebSocket message received:', data)
    
    if (data.type === 'ack') {
      console.log('✅ AppSync Events message acknowledged')
      return
    }
    
    if (data.type === 'error') {
      console.error('❌ AppSync Events error:', data)
      return
    }
    
    if (data.type === 'data' && data.payload) {
      // Handle incoming events from local AppSync server
      try {
        const eventData = data.payload.data?.subscribe || data.payload.data
        console.log('📨 Received local event:', eventData)
        
        if (eventData) {
          // Route the event to all subscribers (simple approach)
          this.subscriptions.forEach((callback, channelName) => {
            console.log(`📨 Calling callback for channel: ${channelName}`)
            callback(eventData)
          })
        }
      } catch (error) {
        console.error('Error parsing local event data:', error)
      }
    }
    
    if (data.type === 'data' && data.event) {
      // Handle incoming events (AWS AppSync Events uses 'data' type with event field)
      try {
        const eventData = JSON.parse(data.event)
        console.log('📨 Received AWS event:', eventData)
        
        // Route the event to all subscribers (simple approach)
        this.subscriptions.forEach((callback, channelName) => {
          console.log(`📨 Calling callback for AWS channel: ${channelName}`)
          callback(eventData)
        })
      } catch (error) {
        console.error('Error parsing AWS event data:', error)
      }
    }
    
    if (data.type === 'subscribe_success') {
      console.log('✅ Subscription successful:', data)
    }
    
    if (data.type === 'subscribe_error') {
      console.error('❌ Subscription error:', data)
    }
  }

  private send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      console.warn('WebSocket not connected, cannot send message:', message)
    }
  }

  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)
      
      setTimeout(() => {
        this.connect().catch(error => {
          console.error('Reconnection failed:', error)
        })
      }, this.reconnectDelay * this.reconnectAttempts)
    } else {
      console.error('❌ Max reconnection attempts reached')
    }
  }

  subscribe(channelName: string, callback: (message: ChatMessage) => void) {
    console.log(`📡 Subscribing to channel: ${channelName}`)
    
    // Store the callback with the original channel name for lookup
    this.subscriptions.set(channelName, callback)
    
    // Use simple channel name for proper isolation
    const defaultChannelName = `/default/${channelName}`
    console.log(`📡 Subscription registered for channel: ${defaultChannelName}`)
    
    // For local development, use 'start' type. For AWS AppSync, use 'subscribe' type
    const isLocal = process.env.NODE_ENV === 'development'
    const messageType = isLocal ? 'start' : 'subscribe'
    
    if (this.isConnected && this.ws) {
      const subscribeMessage = {
        id: `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: messageType,
        ...(isLocal ? {
          payload: {
            data: channelName
          }
        } : {
          channel: defaultChannelName,
          authorization: { 
            'x-api-key': process.env.NEXT_PUBLIC_APPSYNC_API_KEY,
            'host': process.env.NEXT_PUBLIC_APPSYNC_GRAPHQL_ENDPOINT
          }
        })
      }
      
      console.log('📡 Sending subscription message:', subscribeMessage)
      this.send(subscribeMessage)
    }
  }

  unsubscribe(channelName: string) {
    console.log(`📡 Unsubscribing from channel: ${channelName}`)
    
    // For local development, send 'stop' message to server
    const isLocal = process.env.NODE_ENV === 'development'
    if (isLocal && this.isConnected && this.ws) {
      const unsubscribeMessage = {
        id: `unsub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'stop',
        payload: {
          data: channelName
        }
      }
      
      console.log('📡 Sending unsubscribe message:', unsubscribeMessage)
      this.send(unsubscribeMessage)
    }
    
    // Remove the callback
    this.subscriptions.delete(channelName)
  }

  // Publish an event to a channel using AppSync Events
  async publishEvent(channelName: string, message: ChatMessage): Promise<void> {
    // Try to connect if not already connected
    if (!this.isConnected || !this.ws) {
      console.log('📡 WebSocket not connected, attempting to connect...')
      try {
        await this.connect()
      } catch (error) {
        console.error('Failed to connect to AppSync Events:', error)
        return
      }
    }

    // Use the actual channel name for proper message routing
    const isLocal = process.env.NODE_ENV === 'development'
    const publishMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'publish',
      ...(isLocal ? {
        roomId: channelName,
        message: message
      } : {
        channel: `/default/${channelName}`,
        events: [JSON.stringify(message)],
        authorization: { 
          'x-api-key': process.env.NEXT_PUBLIC_APPSYNC_API_KEY,
          'host': process.env.NEXT_PUBLIC_APPSYNC_GRAPHQL_ENDPOINT
        }
      })
    }

    console.log('📤 Publishing event to AppSync Events:', publishMessage)
    this.send(publishMessage)
  }

  // Simulate receiving a message (for testing)
  simulateMessage(channelName: string, message: ChatMessage) {
    console.log(`📨 Simulating message for channel: ${channelName}`)
    const callback = this.subscriptions.get(channelName)
    if (callback) {
      console.log(`📨 Found callback for channel: ${channelName}`)
      callback(message)
    } else {
      console.log(`📨 No callback found for channel: ${channelName}`)
      console.log(`📨 Available subscriptions:`, Array.from(this.subscriptions.keys()))
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.subscriptions.clear()
    this.isConnected = false
    console.log('🔌 AppSync WebSocket disconnected')
  }

  getConnectionStatus(): boolean {
    return this.isConnected
  }
}

// Export singleton instance
export const appSyncService = new AppSyncService()
export default appSyncService
