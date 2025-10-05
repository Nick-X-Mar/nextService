'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { HiArrowLeft, HiChatBubbleLeftRight, HiUser, HiPaperAirplane, HiPhoto } from 'react-icons/hi2'
import { styles } from '../../../../../../styles/styles'
import { useToast } from '../../../../../../hooks/useToast'
import ClientNavigation from '../../../../../../components/ClientNavigation'
import '@/lib/amplify-config'
import appSyncService from '@/lib/appsync-service'

interface ChatMessage {
  id: string
  requestId: string
  senderId: string
  senderType: 'client' | 'garage'
  senderName: string
  message: string
  timestamp: string
}

interface Garage {
  id: string
  companyName: string
  logoUrl?: string
  lastMessage?: string
  lastMessageTime?: string
  hasUnreadMessages?: boolean
}

interface IndividualChatPageProps {
  clientId: string
  requestId: string
}

export default function IndividualChatPage({ clientId, requestId }: IndividualChatPageProps) {
  const router = useRouter()
  const { showToast } = useToast()
  
  const [garages, setGarages] = useState<Garage[]>([])
  const [selectedGarage, setSelectedGarage] = useState<Garage | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  
  const subscriptionRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Fetch garages that have messages for this request
  const fetchGarages = async () => {
    try {
      const response = await fetch(`/api/chat/${requestId}/garages`)
      if (response.ok) {
        const data = await response.json()
        setGarages(data.garages || [])
        if (data.garages && data.garages.length > 0) {
          setSelectedGarage(data.garages[0])
        }
      }
    } catch (error) {
      console.error('Error fetching garages:', error)
      showToast({ type: 'error', title: 'Σφάλμα κατά τη φόρτωση των συνεργείων' })
    }
  }

  // Fetch messages for selected garage
  const fetchMessages = async (garageId: string) => {
    try {
      const response = await fetch(`/api/chat/${requestId}/messages?garageId=${garageId}`)
      if (response.ok) {
        const data = await response.json()
        setMessages(data.messages || [])
        // Scroll to bottom after messages are loaded
        setTimeout(() => {
          scrollToBottom()
        }, 100)
      }
    } catch (error) {
      console.error('Error fetching messages:', error)
      showToast({ type: 'error', title: 'Σφάλμα κατά τη φόρτωση των μηνυμάτων' })
    }
  }

  // Subscribe to real-time messages using AWS AppSync
  const subscribeToMessages = async (garageId: string) => {
    // Clear existing subscription
    if (subscriptionRef.current) {
      appSyncService.unsubscribe(subscriptionRef.current)
    }
    
    const channelName = `request-${requestId}-garage-${garageId}`
    console.log(`[Client] Subscribing to AppSync channel: ${channelName}`)
    
    try {
      // Connect to AppSync if not already connected
      if (!appSyncService.getConnectionStatus()) {
        await appSyncService.connect()
      }
      
      // Subscribe to the channel
      appSyncService.subscribe(channelName, (newMessage: ChatMessage) => {
        console.log('[Client] Real-time message received:', newMessage)
        
        setMessages(prev => {
          console.log('[Client] setMessages - prev messages:', prev)
          console.log('[Client] setMessages - newMessage:', newMessage)
          
          // Prevent duplicate messages
          const exists = prev.some(msg => msg.id === newMessage.id)
          console.log('[Client] setMessages - message exists:', exists)
          
          if (exists) {
            console.log('[Client] setMessages - message already exists, not adding')
            return prev
          }
          
          // Add new message and sort by timestamp
          const newMessages = [...prev, newMessage].sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          )
          console.log('[Client] setMessages - new messages array:', newMessages)
          return newMessages
        })
      })
      
      subscriptionRef.current = channelName
    } catch (error) {
      console.error('[Client] Error subscribing to AppSync:', error)
      showToast({ type: 'error', title: 'Σφάλμα στη σύνδεση για πραγματικό χρόνο' })
    }
  }
  
  // Stop subscription
  const stopSubscription = () => {
    if (subscriptionRef.current) {
      appSyncService.unsubscribe(subscriptionRef.current)
      subscriptionRef.current = null
      console.log('[Client] Stopped AppSync subscription')
    }
  }

  // Send new message
  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedGarage || sending) return

    setSending(true)
    try {
      const response = await fetch(`/api/chat/${requestId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: newMessage.trim(),
          senderId: clientId,
          senderType: 'client',
          garageId: selectedGarage.id
        }),
      })

      if (response.ok) {
        setNewMessage('')
        // Refresh messages
        await fetchMessages(selectedGarage.id)
        // Scroll to bottom after sending message
        setTimeout(() => {
          scrollToBottom()
        }, 100)
      } else {
        const error = await response.json()
        showToast({ type: 'error', title: error.error || 'Σφάλμα κατά την αποστολή του μηνύματος' })
      }
    } catch (error) {
      console.error('Error sending message:', error)
      showToast({ type: 'error', title: 'Σφάλμα κατά την αποστολή του μηνύματος' })
    } finally {
      setSending(false)
    }
  }

  // Mark messages as read
  const markMessagesAsRead = async (garageId: string) => {
    try {
      await fetch(`/api/chat/${requestId}/mark-read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ garageId })
      })
    } catch (error) {
      console.error('Error marking messages as read:', error)
    }
  }

  // Handle garage selection
  const handleGarageSelect = (garage: Garage) => {
    setSelectedGarage(garage)
    fetchMessages(garage.id)
    subscribeToMessages(garage.id)
    // Mark messages as read when garage is selected
    markMessagesAsRead(garage.id)
  }

  // Get garage initials
  const getGarageInitials = (companyName: string) => {
    return companyName
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  // Format timestamp
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('el-GR', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Format date
  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return 'Σήμερα'
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Χθες'
    } else {
      return date.toLocaleDateString('el-GR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })
    }
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await fetchGarages()
      setLoading(false)
    }
    loadData()
  }, [requestId])

  useEffect(() => {
    if (selectedGarage) {
      fetchMessages(selectedGarage.id)
      subscribeToMessages(selectedGarage.id)
      // Mark messages as read when garage is initially selected
      markMessagesAsRead(selectedGarage.id)
    }
  }, [selectedGarage])

  // Cleanup subscription on unmount
  useEffect(() => {
    return () => {
      stopSubscription()
    }
  }, [])

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Scroll to bottom when garage selection changes
  useEffect(() => {
    if (selectedGarage) {
      // Small delay to ensure messages are loaded
      setTimeout(() => {
        scrollToBottom()
      }, 100)
    }
  }, [selectedGarage])

  if (loading) {
    return (
      <section className="bg-white min-h-screen">
        <ClientNavigation clientId={clientId} />
        <div className={`${styles.container} py-24`}>
          <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-400 mx-auto mb-4"></div>
              <p className="text-base text-gray-600">Φόρτωση συνομιλιών...</p>
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="bg-white min-h-screen">
      <ClientNavigation clientId={clientId} />
      <div className={`${styles.container} py-24`}>
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.push(`/requests/${clientId}/chats`)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <HiArrowLeft className="h-5 w-5" />
            <span className="text-sm font-medium">Πίσω</span>
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Συνομιλία</h1>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="flex h-[600px]">
            {/* Sidebar with garages */}
            <div className="w-80 border-r border-gray-200 bg-gray-50">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Συνεργεία</h2>
              </div>
              
              <div className="overflow-y-auto h-full">
                {garages.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    <HiChatBubbleLeftRight className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm">Δεν υπάρχουν συνομιλίες</p>
                  </div>
                ) : (
                  <div className="p-2">
                    {garages.map((garage) => (
                      <button
                        key={garage.id}
                        onClick={() => handleGarageSelect(garage)}
                        className={`w-full p-3 rounded-lg text-left transition-colors mb-2 ${
                          selectedGarage?.id === garage.id
                            ? 'bg-orange-100 border border-orange-200'
                            : 'hover:bg-gray-100'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Garage Avatar */}
                          <div className="flex-shrink-0">
                            {garage.logoUrl ? (
                              <img
                                src={garage.logoUrl}
                                alt={garage.companyName}
                                className="w-10 h-10 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center">
                                <span className="text-white font-semibold text-sm">
                                  {getGarageInitials(garage.companyName)}
                                </span>
                              </div>
                            )}
                          </div>
                          
                          {/* Garage Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h3 className="text-sm font-medium text-gray-900 truncate">
                                {garage.companyName}
                              </h3>
                              {garage.hasUnreadMessages && (
                                <span className="bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center font-bold">
                                  !
                                </span>
                              )}
                            </div>
                            {garage.lastMessage && (
                              <p className="text-xs text-gray-500 truncate mt-1">
                                {garage.lastMessage}
                              </p>
                            )}
                            {garage.lastMessageTime && (
                              <p className="text-xs text-gray-400 mt-1">
                                {formatTime(garage.lastMessageTime)}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Main chat area */}
            <div className="flex-1 flex flex-col">
              {selectedGarage ? (
                <>
                  {/* Chat header */}
                  <div className="p-4 border-b border-gray-200 bg-white">
                    <div className="flex items-center gap-3">
                      {selectedGarage.logoUrl ? (
                        <img
                          src={selectedGarage.logoUrl}
                          alt={selectedGarage.companyName}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center">
                          <span className="text-white font-semibold text-xs">
                            {getGarageInitials(selectedGarage.companyName)}
                          </span>
                        </div>
                      )}
                      <div>
                        <h3 className="font-semibold text-gray-900">{selectedGarage.companyName}</h3>
                        <p className="text-sm text-gray-500">Συνεργείο</p>
                      </div>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.length === 0 ? (
                      <div className="text-center text-gray-500 py-8">
                        <HiChatBubbleLeftRight className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                        <p>Δεν υπάρχουν μηνύματα ακόμα</p>
                        <p className="text-sm mt-2">Ξεκινήστε τη συνομιλία!</p>
                      </div>
                    ) : (
                      messages.map((message, index) => {
                        // Debug: Log message data to identify key issues
                        console.log(`[IndividualChatPage] Message ${index}:`, { id: message.id, timestamp: message.timestamp, senderType: message.senderType })
                        
                        const isClient = message.senderType === 'client'
                        const showDate = index === 0 || 
                          formatDate(message.timestamp) !== formatDate(messages[index - 1].timestamp)
                        
                        // Ensure we have a valid key - use index as fallback if message.id is missing
                        const messageKey = message.id || `message-${index}-${message.timestamp}`
                        
                        return (
                          <div key={messageKey}>
                            {showDate && (
                              <div className="text-center text-xs text-gray-500 py-2">
                                {formatDate(message.timestamp)}
                              </div>
                            )}
                            <div className={`flex ${isClient ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                                isClient 
                                  ? 'bg-orange-500 text-white' 
                                  : 'bg-gray-100 text-gray-900'
                              }`}>
                                <p className="text-sm">{message.message}</p>
                                <p className={`text-xs mt-1 ${
                                  isClient ? 'text-orange-100' : 'text-gray-500'
                                }`}>
                                  {formatTime(message.timestamp)}
                                </p>
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                    {/* Scroll target element */}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Message input */}
                  <div className="p-4 border-t border-gray-200 bg-white">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                        placeholder="Γράψτε το μήνυμά σας..."
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        disabled={sending}
                      />
                      <button
                        onClick={sendMessage}
                        disabled={!newMessage.trim() || sending}
                        className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                      >
                        {sending ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        ) : (
                          <HiPaperAirplane className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <HiChatBubbleLeftRight className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p>Επιλέξτε ένα συνεργείο για να ξεκινήσετε τη συνομιλία</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
