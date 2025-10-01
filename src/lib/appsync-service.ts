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
        const wsUrl = `${endpoint}/event/realtime`
        console.log('🔌 AppSync Events WebSocket URL:', wsUrl)
        
        // Use the correct AppSync Events WebSocket protocol
        this.ws = new WebSocket(wsUrl, [
          'aws-appsync-event-ws',
          getAuthProtocol(),
        ])
        
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
    
    if ((data.type === 'event' || data.type === 'data') && data.event) {
      // Handle incoming events (AppSync Events uses 'data' type)
      try {
        const eventData = JSON.parse(data.event)
        console.log('📨 Received event:', eventData)
        console.log('📨 Event data type:', typeof eventData)
        console.log('📨 Event data keys:', Object.keys(eventData))
        
        // Route the event to all subscribers since we're using a single channel
        this.subscriptions.forEach((callback, channelName) => {
          console.log(`📨 Calling callback for channel: ${channelName}`)
          callback(eventData)
        })
      } catch (error) {
        console.error('Error parsing event data:', error)
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
    
    // Use the same simple channel name format as publishing
    const simpleChannelName = 'chat-channel'
    const defaultChannelName = `/default/${simpleChannelName}`
    console.log(`📡 Subscription registered for channel: ${defaultChannelName}`)
    
    // For AppSync Events, we need to send a subscription message
    if (this.isConnected && this.ws) {
      const subscribeMessage = {
        id: `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'subscribe',
        channel: defaultChannelName,
        authorization: { 
          'x-api-key': process.env.NEXT_PUBLIC_APPSYNC_API_KEY,
          'host': process.env.NEXT_PUBLIC_APPSYNC_GRAPHQL_ENDPOINT
        }
      }
      
      console.log('📡 Sending subscription message:', subscribeMessage)
      this.send(subscribeMessage)
    }
  }

  unsubscribe(channelName: string) {
    console.log(`📡 Unsubscribing from channel: ${channelName}`)
    
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

    // Use a simple channel name format as shown in AWS documentation
    const simpleChannelName = 'chat-channel' // Simplified channel name
    
    const publishMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'publish',
      channel: `/default/${simpleChannelName}`, // Use simple channel name as per AWS docs
      events: [JSON.stringify(message)],
      authorization: { 
        'x-api-key': process.env.NEXT_PUBLIC_APPSYNC_API_KEY,
        'host': process.env.NEXT_PUBLIC_APPSYNC_GRAPHQL_ENDPOINT
      }
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
