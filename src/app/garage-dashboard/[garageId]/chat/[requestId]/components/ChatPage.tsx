'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Card, Button, Input } from '@/components'
import { styles } from '@/styles/styles'

interface Message {
  id: string
  senderId: string
  senderType: 'garage' | 'client'
  message: string
  timestamp: string
  senderName: string
}

interface ServiceRequest {
  id: string
  description: string
  category: string
  urgency: string
  status: string
  createdAt: string
  client: {
    firstName: string
    lastName: string
    phoneNumber: string
  }
  vehicle: {
    brand: string
    model: string
    year: number
    licensePlate: string
  }
  photoUrls?: string[]
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

  useEffect(() => {
    loadChatData()
  }, [garageId, requestId])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadChatData = async () => {
    try {
      setIsLoading(true)
      
      // Load request data
      const requestResponse = await fetch(`/api/requests/${requestId}`)
      if (requestResponse.ok) {
        const requestResult = await requestResponse.json()
        if (requestResult.success) {
          setRequestData(requestResult.request)
        }
      }

      // Load garage data
      const garageResponse = await fetch(`/api/garage/${garageId}`)
      if (garageResponse.ok) {
        const garageResult = await garageResponse.json()
        if (garageResult.success) {
          setGarageData(garageResult.garage)
        }
      }

      // Load chat messages
      const messagesResponse = await fetch(`/api/chat/${requestId}/messages`)
      if (messagesResponse.ok) {
        const messagesResult = await messagesResponse.json()
        if (messagesResult.success) {
          setMessages(messagesResult.messages)
        }
      }
    } catch (error) {
      console.error('Error loading chat data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim() || isSending) return

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
          senderType: 'garage'
        })
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setMessages(prev => [...prev, result.message])
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
        <Card className="p-4 mb-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className={`${styles.sectionTitle} mb-2`}>
                {requestData.vehicle.brand} {requestData.vehicle.model} ({requestData.vehicle.year})
              </h3>
              <p className={`${styles.bodyText} mb-2`}>
                <strong>Πελάτης:</strong> {requestData.client.firstName} {requestData.client.lastName}
              </p>
              <p className={`${styles.bodyText} mb-2`}>
                <strong>Τηλέφωνο:</strong> {requestData.client.phoneNumber}
              </p>
              <p className={`${styles.bodyText} mb-2`}>
                <strong>Πινακίδα:</strong> {requestData.vehicle.licensePlate}
              </p>
              <p className={`${styles.bodyText} mb-2`}>
                <strong>Αίτημα:</strong> {requestData.description}
              </p>
            </div>
            <div className="text-right">
              <p className={`${styles.smallText} text-gray-500`}>
                {new Date(requestData.createdAt).toLocaleDateString('el-GR')}
              </p>
            </div>
          </div>
        </Card>
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
              messages.map((message) => (
                <div
                  key={message.id}
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
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
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
        </Card>
      </div>
    </div>
  )
}


