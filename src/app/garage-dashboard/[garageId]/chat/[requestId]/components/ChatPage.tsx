'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { RequestDetailsPanel } from '@/components'
import { styles } from '@/styles/styles'
import { ServiceRequestStatus } from '@/types/statuses'
import type { ServiceRequest } from '@/types/requests'
import { useAuth } from '@/contexts/AuthContext'
import Icon from '@/components/ui/Icon'
import { LoadMoreButton, Spinner } from '@/components'
import '@/lib/amplify-config'
import appSyncService from '@/lib/appsync-service'
import { useNotifications } from '@/contexts/NotificationsContext'
import { getCategoryText } from '@/utils/categoryLabels'

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
  // Cursor for the next page of OLDER messages; null once history is exhausted.
  const [olderCursor, setOlderCursor] = useState<string | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [requestData, setRequestData] = useState<ServiceRequest | null>(null)
  const [garageData, setGarageData] = useState<Record<string, unknown> | null>(null)
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()
  const { refresh: refreshUnread } = useNotifications()
  // Read-only once the job is booked — unless this is the garage that got it, which
  // still has an appointment to arrange with the customer.
  const isReadOnly =
    requestData?.status === ServiceRequestStatus.APPOINTMENT &&
    requestData?.acceptedGarageId !== garageId

  // Subscription refs
  const subscriptionRef = useRef<string | null>(null)

  const { userType, garage: authGarage, isLoading: authLoading } = useAuth()

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Subscribe to real-time messages using AWS AppSync
  const subscribeToMessages = useCallback(async () => {
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

        // Ignore subscription system events (e.g. {status: "subscribed"})
        if (!newMessage.id || !newMessage.timestamp || !newMessage.message) return

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
  }, [requestId, garageId])

  // Stop subscription
  const stopSubscription = () => {
    if (subscriptionRef.current) {
      appSyncService.unsubscribe(subscriptionRef.current)
      subscriptionRef.current = null
      console.log('[Garage] Stopped AppSync subscription')
    }
  }

  /**
   * Pulls the next page of older messages and prepends it. The API returns
   * newest-first pages, so each call walks further back through the thread.
   */
  const loadOlderMessages = useCallback(async () => {
    if (!olderCursor || loadingOlder) return
    setLoadingOlder(true)
    try {
      const res = await fetch(
        `/api/chat/${requestId}/messages/?garageId=${garageId}&cursor=${encodeURIComponent(olderCursor)}`
      )
      if (res.ok) {
        const result = await res.json()
        const older = (result.messages || []).filter(
          (msg: Message) => msg.timestamp && !isNaN(new Date(msg.timestamp).getTime())
        )
        setOlderCursor(result.nextCursor ?? null)
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id))
          return [...older.filter((m: Message) => !seen.has(m.id)), ...prev]
        })
      }
    } catch (error) {
      console.error('Error loading older messages:', error)
    } finally {
      setLoadingOlder(false)
    }
  }, [olderCursor, loadingOlder, requestId, garageId])

  const loadChatData = useCallback(async () => {
    try {
      setIsLoading(true)

      // Load request data — pass viewerGarageId for the GDPR audit log
      const requestResponse = await fetch(`/api/requests/${requestId}/?viewerGarageId=${garageId}`)
      if (requestResponse.ok) {
        const requestResult = await requestResponse.json()
        // Some endpoints return { success, request }, others may return just { request }
        const request = requestResult.request || requestResult
        setRequestData(request)
      }

      // Load garage data
      const garageResponse = await fetch(`/api/garage/${garageId}/`)
      if (garageResponse.ok) {
        const garageResult = await garageResponse.json()
        if (garageResult.success) {
          setGarageData(garageResult.garage)
        }
      }

      // Load chat messages (filtered by garageId for security)
      const messagesResponse = await fetch(`/api/chat/${requestId}/messages/?garageId=${garageId}`)
      if (messagesResponse.ok) {
        const messagesResult = await messagesResponse.json()
        if (messagesResult.success) {
          const validMessages = (messagesResult.messages || []).filter(
            (msg: Message) => msg.timestamp && !isNaN(new Date(msg.timestamp).getTime())
          )
          setOlderCursor(messagesResult.nextCursor ?? null)
          setMessages(validMessages)
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
  }, [requestId, garageId, subscribeToMessages])

  useEffect(() => {
    // Wait for auth to load
    if (authLoading) {
      return
    }

    // Check if user is authenticated as a garage
    if (userType !== 'garage' || !authGarage || authGarage.id !== garageId) {
      // User is not authenticated as this garage or is a client
      console.warn('Unauthorized access attempt to garage chat')
      router.push('/login/')
      return
    }

    loadChatData()

    // Opening the thread is what clears it. Without this the garage's unread
    // badge and chat-list counts would never come down — nothing else writes
    // the garage's read marker.
    fetch(`/api/chat/${requestId}/mark-read/`, { method: 'POST' })
      .then(() => refreshUnread())
      .catch(() => { /* a stale badge is not worth interrupting the chat for */ })
  }, [garageId, requestId, router, userType, authGarage, authLoading, loadChatData, refreshUnread])

  // Cleanup subscription on unmount
  useEffect(() => {
    return () => {
      stopSubscription()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSendMessage = async () => {
    if (!newMessage.trim() || isSending || isReadOnly) return

    try {
      setIsSending(true)

      const response = await fetch(`/api/chat/${requestId}/messages/`, {
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
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
          }
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

  const handleTextareaInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }

  const formatMessageTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('el-GR', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getDateSeparator = (timestamp: string) => {
    const date = new Date(timestamp)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) return 'Σήμερα'
    if (date.toDateString() === yesterday.toDateString()) return 'Χθες'
    return date.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  // Group messages by date
  const groupedMessages = messages.reduce<{ date: string; messages: Message[] }[]>((groups, message) => {
    const dateStr = new Date(message.timestamp).toDateString()
    const lastGroup = groups[groups.length - 1]
    if (lastGroup && new Date(lastGroup.messages[0].timestamp).toDateString() === dateStr) {
      lastGroup.messages.push(message)
    } else {
      groups.push({ date: dateStr, messages: [message] })
    }
    return groups
  }, [])

  if (isLoading) {
    return (
      <div className="app-viewport bg-surface flex items-center justify-center">
        <div className="text-center">
          <div className={styles.loadingSpinner}></div>
          <p className={styles.bodyText}>Φόρτωση συνομιλίας...</p>
        </div>
      </div>
    )
  }

  if (!requestData || !garageData) {
    return (
      <div className="app-viewport bg-surface flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mx-auto mb-4">
            <Icon name="error" size="lg" className="text-tertiary" />
          </div>
          <h2 className={`${styles.sectionTitle} mb-2`}>Σφάλμα</h2>
          <p className={`${styles.bodyText} mb-6`}>Δεν ήταν δυνατή η φόρτωση των δεδομένων.</p>
          <button onClick={() => router.back()} className={styles.btnOutline}>
            <Icon name="arrow_back" size="sm" />
            Επιστροφή
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col app-viewport overflow-hidden bg-surface">
      {/* Header */}
      <div className="bg-surface-container-lowest border-b border-outline-variant/10 flex-shrink-0 z-20">
        <div className="max-w-3xl mx-auto px-5 md:px-8">
          <div className="flex items-center gap-3 py-3">
            <button
              onClick={() => router.back()}
              className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center hover:bg-surface-container-highest transition-colors flex-shrink-0"
            >
              <Icon name="arrow_back" size="sm" className="text-on-surface" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-bold text-on-surface truncate">
                {requestData.client?.firstName} {requestData.client?.lastName}
              </h1>
              <p className="text-xs text-secondary truncate">
                {requestData.vehicle?.brand} {requestData.vehicle?.model} -- {getCategoryText(requestData.category)}
              </p>
            </div>
            {isReadOnly && (
              <span className={styles.statusAppointment}>
                Ραντεβού
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Request Context (collapsible) — capped so an expanded panel scrolls
          inside itself instead of pushing the composer off the screen. */}
      <div className="max-w-3xl mx-auto w-full px-5 md:px-8 pt-3 flex-shrink-0 max-h-[45%] overflow-y-auto">
        <RequestDetailsPanel
          request={requestData}
          allowEdit={false}
        />
      </div>

      {/* Chat Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <LoadMoreButton
          hasMore={!!olderCursor}
          loading={loadingOlder}
          onClick={loadOlderMessages}
          label="Παλαιότερα μηνύματα"
          icon="history"
        />
        <div className="max-w-3xl mx-auto px-5 md:px-8 py-4">
          {messages.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mx-auto mb-4">
                <Icon name="chat_bubble_outline" size="lg" className="text-secondary" />
              </div>
              <p className="text-sm font-bold text-on-surface mb-1">Δεν υπάρχουν μηνύματα ακόμα</p>
              <p className="text-xs text-secondary">Ξεκινήστε τη συνομιλία!</p>
            </div>
          ) : (
            groupedMessages.map((group, groupIndex) => (
              <div key={groupIndex}>
                {/* Date Separator */}
                <div className="flex justify-center my-4">
                  <span className="text-[10px] uppercase tracking-[0.15em] text-secondary bg-surface-container px-4 py-1 rounded-full">
                    {getDateSeparator(group.messages[0].timestamp)}
                  </span>
                </div>

                {/* Messages in this group */}
                {group.messages.map((message) => {
                  const messageKey = message.id || `message-${groupIndex}-${message.timestamp}`
                  const isGarage = message.senderType === 'garage'

                  return (
                    <div
                      key={messageKey}
                      className={`flex mb-3 ${isGarage ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[75%] ${
                        isGarage
                          ? 'machined-gradient text-white rounded-xl rounded-tr-none'
                          : 'bg-surface-container-low text-on-surface rounded-xl rounded-tl-none'
                      } px-4 py-2.5`}>
                        {!isGarage && (
                          <p className="text-[10px] font-bold text-primary mb-0.5">{message.senderName}</p>
                        )}
                        <p className="text-sm leading-relaxed">{message.message}</p>
                        <p className={`text-[10px] mt-1 ${
                          isGarage ? 'text-white/60' : 'text-secondary'
                        }`}>
                          {formatMessageTime(message.timestamp)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Message Input / Read-only notice */}
      {isReadOnly ? (
        <div className="flex-shrink-0 border-t border-outline-variant/10 bg-surface-container-lowest/80 backdrop-blur-xl">
          <div className="max-w-3xl mx-auto px-5 md:px-8 py-3">
            <div className="flex items-center gap-2 justify-center text-sm text-secondary bg-surface-container rounded-xl px-4 py-3">
              <Icon name="lock" size="sm" className="text-secondary" />
              <span>Το αίτημα ανατέθηκε σε άλλο συνεργείο -- η συνομιλία είναι μόνο για ανάγνωση.</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-shrink-0 border-t border-outline-variant/10 bg-surface-container-lowest/80 backdrop-blur-xl">
          <div className="max-w-3xl mx-auto px-5 md:px-8 py-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                onInput={handleTextareaInput}
                placeholder="Γράψτε μήνυμα..."
                className="flex-1 bg-surface-container-highest border-0 rounded-xl px-4 py-3 text-sm font-medium text-on-surface focus:ring-2 focus:ring-primary focus:bg-surface-container-lowest transition-all resize-none max-h-[120px]"
                rows={1}
                disabled={isSending}
              />
              <button
                onClick={handleSendMessage}
                disabled={!newMessage.trim() || isSending}
                className="w-10 h-10 rounded-full machined-gradient flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 shadow-lg shadow-primary/20 flex-shrink-0 mb-0.5"
              >
                {isSending ? (
                  <Spinner size="sm" className="text-on-primary" />
                ) : (
                  <Icon name="send" size="sm" className="text-on-primary" filled />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
