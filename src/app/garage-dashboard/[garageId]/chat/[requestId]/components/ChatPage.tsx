'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Card, Button, Input, RequestDetailsPanel } from '@/components'
import { styles } from '@/styles/styles'
import { ServiceRequestStatus } from '@/types/statuses'
import type { ServiceRequest } from '@/types/requests'
import { useAuth } from '@/contexts/AuthContext'
import '@/lib/amplify-config'
import appSyncService from '@/lib/appsync-service'

interface Message {
  id: string
  senderId: string
  senderType: 'garage' | 'client'
  message: string
  timestamp: string
  senderName: string
}

interface ChatPageProps {
  garageId: string
  requestId: string
}

export default function ChatPage({ garageId, requestId }: ChatPageProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [requestData, setRequestData] = useState<ServiceRequest | null>(null)
  const [garageData, setGarageData] = useState<any>(null)
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const isReadOnly = requestData?.status === ServiceRequestStatus.APPOINTMENT
  
  // Subscription refs
  const subscriptionRef = useRef<string | null>(null)

  const { userType, garage: authGarage, isLoading: authLoading } = useAuth()

  useEffect(() => {
    // Wait for auth to load
    if (authLoading) {
      return
    }

    // Check if user is authenticated as a garage
    if (userType !== 'garage' || !authGarage || authGarage.id !== garageId) {
      // User is not authenticated as this garage or is a client
      console.warn('Unauthorized access attempt to garage chat')
      router.push('/login')
      return
    }

    loadChatData()
  }, [garageId, requestId, router, userType, authGarage, authLoading])

  // Cleanup subscription on unmount
  useEffect(() => {
    return () => {
      stopSubscription()
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Subscribe to real-time messages using AWS AppSync
  const subscribeToMessages = async () => {
    // Clear existing subscription
    if (subscriptionRef.current) {
      appSyncService.unsubscribe(subscriptionRef.current)
    }
    
    // Use request ID + garage ID for unique conversation channel
    const channelName = `request-${requestId}-garage-${garageId}`
    console.log(`[Garage] Subscribing to AppSync channel: ${channelName}`)
    
    try {
      // Connect to AppSync if not already connected
      if (!appSyncService.getConnectionStatus()) {
        await appSyncService.connect()
      }
      
      // Subscribe to the channel
      appSyncService.subscribe(channelName, (newMessage: Message) => {
        console.log('[Garage] Real-time message received:', newMessage)
        
        setMessages(prev => {
          // Prevent duplicate messages
          const exists = prev.some(msg => msg.id === newMessage.id)
          if (exists) return prev
          
          // Add new message and sort by timestamp
          return [...prev, newMessage].sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          )
        })
      })
      
      subscriptionRef.current = channelName
    } catch (error) {
      console.error('[Garage] Error subscribing to AppSync:', error)
    }
  }
  
  // Stop subscription
  const stopSubscription = () => {
    if (subscriptionRef.current) {
      appSyncService.unsubscribe(subscriptionRef.current)
      subscriptionRef.current = null
      console.log('[Garage] Stopped AppSync subscription')
    }
  }

  const loadChatData = async () => {
    try {
      setIsLoading(true)
      
      // Load request data
      const requestResponse = await fetch(`/api/requests/${requestId}`)
      if (requestResponse.ok) {
        const requestResult = await requestResponse.json()
        // Some endpoints return { success, request }, others may return just { request }
        const request = requestResult.request || requestResult
        setRequestData(request)
      }

      // Load garage data
      const garageResponse = await fetch(`/api/garage/${garageId}`)
      if (garageResponse.ok) {
        const garageResult = await garageResponse.json()
        if (garageResult.success) {
          setGarageData(garageResult.garage)
        }
      }

      // Load chat messages (filtered by garageId for security)
      const messagesResponse = await fetch(`/api/chat/${requestId}/messages?garageId=${garageId}`)
      if (messagesResponse.ok) {
        const messagesResult = await messagesResponse.json()
        if (messagesResult.success) {
          setMessages(messagesResult.messages)
        }
      }
      
      // Start AppSync subscription after loading initial data
      console.log('[Garage] Starting AppSync subscription...')
      await subscribeToMessages()
    } catch (error) {
      console.error('Error loading chat data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim() || isSending || isReadOnly) return

    try {
      setIsSending(true)
      
      const response = await fetch(`/api/chat/${requestId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: newMessage.trim(),
          senderId: garageId,
          senderType: 'garage',
          garageId: garageId
        })
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          // Don't manually add the message - real-time subscription will handle it
          setNewMessage('')
        }
      }
    } catch (error) {
      console.error('Error sending message:', error)
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const getCategoryText = (category: string) => {
    switch (category) {
      case 'service':
        return 'Συντήρηση'
      case 'brakes':
        return 'Φρένα'
      case 'tires':
        return 'Λάστιχα'
      case 'engine':
        return 'Κινητήρας'
      case 'electrical':
        return 'Ηλεκτρικά'
      case 'oils':
        return 'Λάδια'
      default:
        return category
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className={styles.bodyText}>Φόρτωση συνομιλίας...</p>
        </div>
      </div>
    )
  }

  if (!requestData || !garageData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className={`${styles.pageTitle} mb-4`}>Σφάλμα</h2>
          <p className={styles.bodyText}>Δεν ήταν δυνατή η φόρτωση των δεδομένων.</p>
          <Button
            variant="secondary"
            onClick={() => router.back()}
            className="mt-4"
          >
            Επιστροφή
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center space-x-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.back()}
              >
                ← Επιστροφή
              </Button>
              <div>
                <h1 className={`${styles.pageTitle} text-xl`}>
                  Συνομιλία με {requestData.client.firstName} {requestData.client.lastName}
                </h1>
                <p className={styles.bodyText}>
                  {requestData.vehicle.brand} {requestData.vehicle.model} - {getCategoryText(requestData.category)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Request Context */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <RequestDetailsPanel 
          request={requestData}
          allowEdit={false}
        />
      </div>

      {/* Chat Messages */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="h-96 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <p className={styles.bodyText}>
                  Δεν υπάρχουν μηνύματα ακόμα. Ξεκινήστε τη συνομιλία!
                </p>
              </div>
            ) : (
              messages.map((message, index) => {
                // Debug: Log message data to identify key issues
                console.log(`[ChatPage] Message ${index}:`, { id: message.id, timestamp: message.timestamp, senderType: message.senderType })
                
                // Ensure we have a valid key - use index as fallback if message.id is missing
                const messageKey = message.id || `message-${index}-${message.timestamp}`
                return (
                  <div
                    key={messageKey}
                    className={`flex ${message.senderType === 'garage' ? 'justify-end' : 'justify-start'}`}
                  >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      message.senderType === 'garage'
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-200 text-gray-900'
                    }`}
                  >
                    <p className={styles.bodyText}>{message.message}</p>
                    <p className={`text-xs mt-1 ${
                      message.senderType === 'garage' ? 'text-orange-100' : 'text-gray-500'
                    }`}>
                      {message.senderName} - {new Date(message.timestamp).toLocaleString('el-GR')}
                    </p>
                  </div>
                </div>
                )
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input / Read-only notice */}
          {isReadOnly ? (
            <div className="border-t p-4 bg-gray-50">
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800 text-center">
                Η συνομιλία είναι μόνο για ανάγνωση επειδή έχει προγραμματιστεί ραντεβού για αυτό το αίτημα.
              </div>
            </div>
          ) : (
            <div className="border-t p-4">
              <div className="flex space-x-2">
                <Input
                  value={newMessage}
                  onChange={setNewMessage}
                  onKeyPress={handleKeyPress}
                  placeholder="Γράψτε το μήνυμά σας..."
                  className="flex-1"
                  disabled={isSending}
                />
                <Button
                  variant="primary"
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || isSending}
                  loading={isSending}
                >
                  Αποστολή
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}


