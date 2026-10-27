'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { RequestDetailsPanel, ReviewPanel } from '@/components'
import { styles } from '@/styles/styles'
import { ServiceRequestStatus } from '@/types/statuses'
import type { ServiceRequest } from '@/types/requests'
import { useAuth } from '@/contexts/AuthContext'
import Icon from '@/components/ui/Icon'
import { LoadMoreButton, Spinner, ChatAttachments, AttachmentPreviewStrip, type ChatAttachmentView } from '@/components'
import { useChatAttachments, MAX_CHAT_ATTACHMENTS } from '@/hooks/useChatAttachments'
import appSyncService from '@/lib/appsync-service'
import { useNotifications } from '@/contexts/NotificationsContext'
import { useToast } from '@/hooks/useToast'
import { useNavigation } from '@/hooks/useNavigation'
import { getCategoryText } from '@/utils/categoryLabels'
import { isGarageInactive } from '../../../components/garageInactive'
import GaragePendingView from '../../../chats/components/GaragePendingView'

interface Message {
  id: string
  senderId: string
  senderType: 'garage' | 'client'
  message: string
  timestamp: string
  senderName: string
  // Photos in this thread only. The API scopes them to this garage, so a
  // photo the client sent to a competitor is never in this list.
  attachments?: ChatAttachmentView[]
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const attachments = useChatAttachments()
  const router = useRouter()
  const { back, isNavigating } = useNavigation()
  const { refresh: refreshUnread } = useNotifications()
  const { showToast } = useToast()
  // Whether this thread still takes messages comes from the server, which
  // applies the same rule to the send: once the request leaves the market only
  // the garage that got the job may write, and nobody once it is cancelled.
  // Working it out here as well is how the two drifted apart before.
  const [readOnlyNotice, setReadOnlyNotice] = useState<string | null>(null)
  const isReadOnly = readOnlyNotice !== null
  // The server answered GARAGE_INACTIVE: not approved yet, or deactivated
  // since the session was cached. The pending screen replaces the chat.
  const [inactive, setInactive] = useState(false)
  const isWinner = !!requestData?.acceptedGarageId && requestData.acceptedGarageId === garageId

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
      // subscribe() opens the socket itself and replays the channel once it is
      // up, so there is nothing to await. Awaiting the handshake here is what
      // used to wedge the page: Safari never times a stalled one out.
      appSyncService.subscribe(channelName, (newMessage: Message) => {
        console.log('[Garage] Real-time message received:', newMessage)

        // Ignore subscription system events (e.g. {status: "subscribed"}).
        // A photo-only message still carries a caption, but accept anything
        // with attachments regardless so a future empty-caption send survives.
        const hasBody = !!newMessage.message || (newMessage.attachments?.length ?? 0) > 0
        if (!newMessage.id || !newMessage.timestamp || !hasBody) return

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

  /**
   * Re-pulls the latest page and merges in anything new.
   *
   * Used after the connection comes back: messages published while the socket
   * was down never reached the subscription callback. On Safari the socket
   * dies every time the tab is backgrounded, so this is the normal path rather
   * than an edge case.
   */
  const refreshMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/${requestId}/messages/?garageId=${garageId}`)
      if (!res.ok) return
      const result = await res.json()
      if (!result.success) return
      const fresh: Message[] = (result.messages || []).filter(
        (msg: Message) => msg.timestamp && !isNaN(new Date(msg.timestamp).getTime())
      )
      setMessages(prev => {
        const seen = new Set(prev.map(m => m.id))
        const added = fresh.filter(m => !seen.has(m.id))
        if (added.length === 0) return prev
        return [...prev, ...added].sort((a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )
      })
    } catch (error) {
      console.error('Error refreshing messages:', error)
    }
  }, [requestId, garageId])

  const authGarageId = authGarage?.id

  const loadChatData = useCallback(async () => {
    try {
      setIsLoading(true)

      // These three are independent. Awaiting them one after another made
      // opening a conversation cost the sum of all three round-trips, which is
      // most of the "the chat takes ages to load" complaint on slower
      // connections.
      const [requestResponse, garageResponse, messagesResponse] = await Promise.all([
        // viewerGarageId is passed for the GDPR audit log
        fetch(`/api/requests/${requestId}/?viewerGarageId=${garageId}`),
        fetch(`/api/garage/${garageId}/`),
        // messages are filtered by garageId for security
        fetch(`/api/chat/${requestId}/messages/?garageId=${garageId}`, { cache: 'no-store' }),
      ])

      const [requestResult, garageResult, messagesResult] = await Promise.all([
        requestResponse.json().catch(() => null),
        garageResponse.json().catch(() => null),
        messagesResponse.json().catch(() => null),
      ])

      if (isGarageInactive(requestResponse, requestResult) || isGarageInactive(messagesResponse, messagesResult)) {
        setInactive(true)
        return
      }
      setInactive(false)

      if (requestResponse.ok && requestResult) {
        // Some endpoints return { success, request }, others may return just { request }
        const request = requestResult.request || requestResult
        setRequestData(request)
      }

      if (garageResponse.ok && garageResult?.success) {
        setGarageData(garageResult.garage)
      }

      if (messagesResponse.ok && messagesResult?.success) {
        const validMessages = (messagesResult.messages || []).filter(
          (msg: Message) => msg.timestamp && !isNaN(new Date(msg.timestamp).getTime())
        )
        setOlderCursor(messagesResult.nextCursor ?? null)
        setMessages(validMessages)
        setReadOnlyNotice(
          messagesResult.canWrite === false
            ? messagesResult.readOnlyNotice || 'Η συνομιλία είναι μόνο για ανάγνωση.'
            : null
        )

        // Fire-and-forget: real-time is an enhancement on top of the messages
        // we just fetched, never a precondition for showing them. Only once
        // the server has let us read the thread, though — subscribing after
        // it refused would hold a socket open on a conversation this garage
        // may not see.
        console.log('[Garage] Starting AppSync subscription...')
        void subscribeToMessages()
      }
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
    if (userType !== 'garage' || authGarageId !== garageId) {
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
    // `authGarage.id`, not `authGarage`. AuthContext swaps in a brand new
    // object once /api/auth/me resolves, and useGarageApprovalWatch mints
    // another on every 30s tick and every focus/visibilitychange while a
    // garage is pending. Depending on the object meant each of those re-ran
    // the whole loader: the spinner came back, three fetches went out, and the
    // message list was replaced — deleting anything just sent. Safari and iOS
    // fire those events far more often than desktop Chrome, which is exactly
    // why this looked browser-specific.
  }, [garageId, requestId, router, userType, authGarageId, authLoading, loadChatData, refreshUnread])

  // Cleanup subscription on unmount
  useEffect(() => {
    return () => {
      stopSubscription()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fill the gap left by any outage as soon as the socket is back.
  useEffect(() => appSyncService.onReconnect(refreshMessages), [refreshMessages])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    attachments.addFiles(e.target.files)
    // Reset so picking the same file twice in a row still fires onChange.
    e.target.value = ''
  }

  const appendMessage = (sent: Message | undefined) => {
    if (!sent?.id) return
    setMessages(prev =>
      prev.some(m => m.id === sent.id)
        ? prev
        : [...prev, sent].sort((a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          )
    )
  }

  const handleSendMessage = async () => {
    const text = newMessage.trim()
    if ((!text && !attachments.hasPending) || isSending || isReadOnly) return

    // Photos take the attachments endpoint, which uploads and creates the
    // message in one call. The typed text rides along as the caption.
    if (attachments.hasPending) {
      try {
        setIsSending(true)
        const result = await attachments.upload({ requestId, garageId, caption: text })
        if (!result.ok) {
          if (result.code === 'CHAT_READ_ONLY') setReadOnlyNotice(result.error)
          showToast({ type: 'error', title: result.error })
          return
        }
        if (result.rejected.length > 0) {
          showToast({
            type: 'warning',
            title: 'Κάποιες φωτογραφίες δεν στάλθηκαν',
            message: result.rejected.join('\n'),
          })
        }
        appendMessage(result.message as Message | undefined)
        setNewMessage('')
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto'
        }
      } finally {
        setIsSending(false)
      }
      return
    }

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
          // Render it immediately from the API's own copy of the row. Waiting
          // for the real-time echo instead meant that whenever the socket was
          // down the message you had just sent simply vanished until you
          // refreshed. The subscription de-dupes on id, so the echo is a no-op
          // when it does arrive.
          appendMessage(result.message as Message | undefined)
          setNewMessage('')
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
          }
        }
      } else {
        const err = await response.json().catch(() => ({}))
        // The request changed hands (or was cancelled) while this page was
        // open: lock the composer instead of letting every retry fail.
        if (err.code === 'CHAT_READ_ONLY') {
          setReadOnlyNotice(err.error || 'Η συνομιλία είναι μόνο για ανάγνωση.')
        }
        showToast({ type: 'error', title: err.error || 'Δεν στάλθηκε το μήνυμα. Δοκιμάστε ξανά.' })
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

  if (inactive) {
    return <GaragePendingView garageId={garageId} onApproved={loadChatData} />
  }

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
          <button onClick={back} disabled={isNavigating('__back__')} className={styles.btnOutline}>
            {isNavigating('__back__') ? <Spinner size="sm" /> : <Icon name="arrow_back" size="sm" />}
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
              onClick={back}
              disabled={isNavigating('__back__')}
              className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center hover:bg-surface-container-highest transition-colors flex-shrink-0 disabled:opacity-60"
            >
              {isNavigating('__back__')
                ? <Spinner size="sm" className="text-on-surface" />
                : <Icon name="arrow_back" size="sm" className="text-on-surface" />}
            </button>
            <div className="flex-1 min-w-0">
              {/* The request route sends the surname only to the garage that won
                  the job, and no first name at all for an account without one. */}
              <h1 className="text-base font-bold text-on-surface truncate">
                {[requestData.client?.firstName, requestData.client?.lastName].filter(Boolean).join(' ') || 'Πελάτης'}
              </h1>
              <p className="text-xs text-secondary truncate">
                {requestData.vehicle?.brand} {requestData.vehicle?.model} -- {getCategoryText(requestData.category)}
              </p>
            </div>
            {isWinner && requestData.status === ServiceRequestStatus.APPOINTMENT && (
              <span className={styles.statusAppointment}>Ραντεβού</span>
            )}
            {isWinner && requestData.status === ServiceRequestStatus.COMPLETED && (
              <span className={styles.statusCompleted}>Ολοκληρώθηκε</span>
            )}
            {requestData.status === ServiceRequestStatus.CANCELLED && (
              <span className={styles.statusCancelled}>Ακυρώθηκε</span>
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
                        {(message.attachments?.length ?? 0) > 0 && (
                          <div className="mb-1.5 -mx-1">
                            <ChatAttachments
                              attachments={message.attachments ?? []}
                              onOwnBubble={isGarage}
                            />
                          </div>
                        )}
                        {message.message && (
                          <p className="text-sm leading-relaxed">{message.message}</p>
                        )}
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
          {/* The job is closed: rating the client is the last step of it, and
              the "αξιολόγησε" alert points here. Below the conversation so it
              is what the page scrolls to on arrival. */}
          {isWinner && requestData.status === ServiceRequestStatus.COMPLETED && (
            <div className="mt-6">
              <ReviewPanel
                requestId={requestId}
                counterpartyLabel="τον πελάτη"
                counterpartyName={
                  [requestData.client?.firstName, requestData.client?.lastName].filter(Boolean).join(' ') || undefined
                }
              />
            </div>
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
              <span>{readOnlyNotice}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-shrink-0 border-t border-outline-variant/10 bg-surface-container-lowest/80 backdrop-blur-xl">
          <div className="max-w-3xl mx-auto px-5 md:px-8 py-3">
            <AttachmentPreviewStrip
              files={attachments.pending}
              onRemove={attachments.removeFile}
              disabled={isSending}
            />
            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFilesPicked}
                className="hidden"
              />
              {/* `capture` opens the camera straight away. Mobile only: on
                  desktop it degrades to a second file picker. */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFilesPicked}
                className="hidden"
              />
              <button
                onClick={() => cameraInputRef.current?.click()}
                disabled={isSending || attachments.isFull}
                title="Λήψη φωτογραφίας"
                className="md:hidden w-10 h-10 rounded-full bg-surface-container flex items-center justify-center hover:bg-surface-container-high transition-colors flex-shrink-0 mb-0.5 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
              >
                <Icon name="photo_camera" size="md" filled className="text-on-surface-variant" />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isSending || attachments.isFull}
                title={
                  attachments.isFull
                    ? `Έως ${MAX_CHAT_ATTACHMENTS} φωτογραφίες ανά μήνυμα`
                    : 'Επισύναψη φωτογραφίας'
                }
                className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center hover:bg-surface-container-high transition-colors flex-shrink-0 mb-0.5 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
              >
                <Icon name="add_a_photo" size="md" className="text-on-surface-variant" />
              </button>
              <textarea
                ref={textareaRef}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                onInput={handleTextareaInput}
                placeholder={attachments.hasPending ? 'Προσθέστε λεζάντα (προαιρετικά)...' : 'Γράψτε μήνυμα...'}
                className="flex-1 bg-surface-container-highest border-0 rounded-xl px-4 py-3 text-sm font-medium text-on-surface focus:ring-2 focus:ring-primary focus:bg-surface-container-lowest transition-all resize-none max-h-[120px]"
                rows={1}
                disabled={isSending}
              />
              <button
                onClick={handleSendMessage}
                disabled={(!newMessage.trim() && !attachments.hasPending) || isSending}
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
