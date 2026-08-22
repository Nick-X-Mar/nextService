'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import Icon from '@/components/ui/Icon'
import { useNavigation } from '@/hooks/useNavigation'
import { useNotifications } from '@/contexts/NotificationsContext'
import { styles } from '../../../../../../styles/styles'
import { useToast } from '../../../../../../hooks/useToast'
// Navigation handled by AppShell
import { RequestDetailsPanel, LoadMoreButton, Spinner, ChatAttachments, AttachmentPreviewStrip, type ChatAttachmentView } from '../../../../../../components'
import { useChatAttachments, MAX_CHAT_ATTACHMENTS } from '@/hooks/useChatAttachments'
import { ServiceRequestStatus } from '../../../../../../types/statuses'
import type { ServiceRequest } from '../../../../../../types/requests'
import appSyncService from '@/lib/appsync-service'

interface ChatMessage {
  id: string
  requestId: string
  senderId: string
  senderType: 'client' | 'garage'
  senderName: string
  message: string
  timestamp: string
  // Photos sent in this thread. Present only on messages that carry them, and
  // scoped by the API to the garage this conversation is with.
  attachments?: ChatAttachmentView[]
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
  const { navigate, isNavigating } = useNavigation()
  const { refresh: refreshUnread } = useNotifications()
  const { showToast } = useToast()
  // The chats list links to a specific thread (?garageId=...). On mobile the
  // garage sidebar is hidden, so this is the only way to land on the right one.
  const requestedGarageId = useSearchParams().get('garageId')

  const [garages, setGarages] = useState<Garage[]>([])
  const [selectedGarage, setSelectedGarage] = useState<Garage | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  // Cursor for the next page of OLDER messages; null once history is exhausted.
  const [olderCursor, setOlderCursor] = useState<string | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [requestDetails, setRequestDetails] = useState<ServiceRequest | null>(null)
  // With an appointment booked, only the thread with the chosen garage stays open —
  // the rest of the conversations are history for both sides.
  const isReadOnly =
    requestDetails?.status === ServiceRequestStatus.APPOINTMENT &&
    (!requestDetails?.acceptedGarageId || selectedGarage?.id !== requestDetails.acceptedGarageId)

  const subscriptionRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const attachments = useChatAttachments()

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Fetch request details
  const fetchRequestDetails = useCallback(async () => {
    try {
      const response = await fetch(`/api/requests/${requestId}/`)
      if (response.ok) {
        const data = await response.json()
        // Some endpoints return { success, request }, others may return just { request }
        const request = data.request || data
        setRequestDetails(request)
      }
    } catch (error) {
      console.error('Error fetching request details:', error)
      showToast({ type: 'error', title: 'Σφάλμα κατά τη φόρτωση των λεπτομερειών του αιτήματος' })
    }
  }, [requestId, showToast])

  // Fetch garages that have messages for this request
  const fetchGarages = useCallback(async () => {
    try {
      const response = await fetch(`/api/chat/${requestId}/garages/`)
      if (response.ok) {
        const data = await response.json()
        const list: Garage[] = data.garages || []
        setGarages(list)
        if (list.length > 0) {
          setSelectedGarage(list.find(g => g.id === requestedGarageId) || list[0])
        }
      }
    } catch (error) {
      console.error('Error fetching garages:', error)
      showToast({ type: 'error', title: 'Σφάλμα κατά τη φόρτωση των συνεργείων' })
    }
  }, [requestId, requestedGarageId, showToast])

  /**
   * Pulls the next page of older messages and prepends it.
   *
   * The API returns newest-first pages, so each call walks further back in
   * time. Without this the conversation would simply stop at the most recent
   * page with no way to reach anything before it.
   */
  const loadOlderMessages = useCallback(async () => {
    if (!olderCursor || !selectedGarage || loadingOlder) return
    setLoadingOlder(true)
    try {
      const response = await fetch(
        `/api/chat/${requestId}/messages/?garageId=${selectedGarage.id}&cursor=${encodeURIComponent(olderCursor)}`
      )
      if (response.ok) {
        const data = await response.json()
        const older = (data.messages || []).filter(
          (msg: ChatMessage) => msg.timestamp && !isNaN(new Date(msg.timestamp).getTime())
        )
        setOlderCursor(data.nextCursor ?? null)
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id))
          return [...older.filter((m: ChatMessage) => !seen.has(m.id)), ...prev]
        })
      }
    } catch (error) {
      console.error('Error loading older messages:', error)
    } finally {
      setLoadingOlder(false)
    }
  }, [olderCursor, selectedGarage, loadingOlder, requestId])

  /**
   * Fetch the most recent page of messages for the selected garage. Older
   * history is pulled in on demand by loadOlderMessages().
   *
   * `mode` matters. Opening a thread replaces whatever was on screen, but a
   * gap-filling refetch must MERGE: the list is read from a GSI, which
   * DynamoDB does not serve consistently, and the page is `Limit`ed before the
   * per-garage filter is applied. A replace therefore routinely dropped
   * messages that were genuinely there — including the one the user had just
   * sent — until the next reload.
   */
  const fetchMessages = useCallback(async (
    garageId: string,
    mode: 'replace' | 'merge' = 'replace'
  ) => {
    try {
      const response = await fetch(
        `/api/chat/${requestId}/messages/?garageId=${garageId}`,
        { cache: 'no-store' }
      )
      if (response.ok) {
        const data = await response.json()
        const validMessages: ChatMessage[] = (data.messages || []).filter(
          (msg: ChatMessage) => msg.timestamp && !isNaN(new Date(msg.timestamp).getTime())
        )
        setOlderCursor(data.nextCursor ?? null)
        setMessages((prev) => {
          if (mode === 'replace') return validMessages
          const seen = new Set(prev.map((m) => m.id))
          const additions = validMessages.filter((m) => !seen.has(m.id))
          if (additions.length === 0) return prev
          return [...prev, ...additions].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          )
        })
        // Scroll to bottom after messages are loaded
        setTimeout(() => {
          scrollToBottom()
        }, 100)
      }
    } catch (error) {
      console.error('Error fetching messages:', error)
      showToast({ type: 'error', title: 'Σφάλμα κατά τη φόρτωση των μηνυμάτων' })
    }
  }, [requestId, showToast])

  /**
   * Show a message we just sent straight away, from the API's own copy of the
   * created row. The subscription de-dupes on id, so the real-time echo is a
   * no-op when it arrives — and when the socket is down this is the only thing
   * that puts the message on screen at all.
   */
  const appendMessage = useCallback((sent: ChatMessage | undefined) => {
    if (!sent?.id || !sent.timestamp) return
    setMessages((prev) =>
      prev.some((m) => m.id === sent.id)
        ? prev
        : [...prev, sent].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          )
    )
    setTimeout(() => scrollToBottom(), 50)
  }, [])

  // Subscribe to real-time messages using AWS AppSync
  const subscribeToMessages = useCallback(async (garageId: string) => {
    // Clear existing subscription
    if (subscriptionRef.current) {
      appSyncService.unsubscribe(subscriptionRef.current)
    }

    const channelName = `request-${requestId}-garage-${garageId}`
    console.log(`[Client] Subscribing to AppSync channel: ${channelName}`)

    try {
      // subscribe() opens the socket itself and replays the channel once it is
      // up, so there is nothing to await. Awaiting the handshake here would
      // stall on Safari, which never times a failed one out.
      appSyncService.subscribe(channelName, (newMessage: ChatMessage) => {
        console.log('[Client] Real-time message received:', newMessage)

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
      console.error('[Client] Error subscribing to AppSync:', error)
    }
  }, [requestId])

  // Stop subscription
  const stopSubscription = () => {
    if (subscriptionRef.current) {
      appSyncService.unsubscribe(subscriptionRef.current)
      subscriptionRef.current = null
      console.log('[Client] Stopped AppSync subscription')
    }
  }

  const handleFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    attachments.addFiles(e.target.files)
    // Reset so picking the same file twice in a row still fires onChange.
    e.target.value = ''
  }

  /**
   * Sends whatever is staged: photos (with the typed text as their caption),
   * plain text, or both.
   *
   * Photos go through the attachments endpoint, which uploads and creates the
   * message in one call, so there is no window where a photo exists in S3
   * without a message pointing at it.
   */
  const sendMessage = async () => {
    const text = newMessage.trim()
    if ((!text && !attachments.hasPending) || !selectedGarage || sending || isReadOnly) return

    setSending(true)
    try {
      if (attachments.hasPending) {
        const result = await attachments.upload({
          requestId,
          garageId: selectedGarage.id,
          caption: text,
        })
        if (!result.ok) {
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
        appendMessage(result.message as ChatMessage | undefined)
        setNewMessage('')
      } else {
        const response = await fetch(`/api/chat/${requestId}/messages/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: text,
            senderId: clientId,
            senderType: 'client',
            garageId: selectedGarage.id
          }),
        })

        if (!response.ok) {
          const error = await response.json().catch(() => ({}))
          showToast({ type: 'error', title: error.error || 'Σφάλμα κατά την αποστολή του μηνύματος' })
          return
        }
        const result = await response.json().catch(() => ({}))
        appendMessage(result.message as ChatMessage | undefined)
        setNewMessage('')
      }
    } catch (error) {
      console.error('Error sending message:', error)
      showToast({ type: 'error', title: 'Σφάλμα κατά την αποστολή του μηνύματος' })
    } finally {
      setSending(false)
    }
  }

  // Mark messages as read
  const markMessagesAsRead = useCallback(async (garageId: string) => {
    try {
      await fetch(`/api/chat/${requestId}/mark-read/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ garageId })
      })
      // Drop the nav badge straight away rather than at the next poll.
      refreshUnread()
    } catch (error) {
      console.error('Error marking messages as read:', error)
    }
  }, [requestId, refreshUnread])

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
      await Promise.all([
        fetchRequestDetails(),
        fetchGarages()
      ])
      setLoading(false)
    }
    loadData()
  }, [requestId, fetchRequestDetails, fetchGarages])

  useEffect(() => {
    if (selectedGarage) {
      fetchMessages(selectedGarage.id)
      subscribeToMessages(selectedGarage.id)
      // Mark messages as read when garage is initially selected
      markMessagesAsRead(selectedGarage.id)
    }
  }, [selectedGarage, fetchMessages, subscribeToMessages, markMessagesAsRead])

  // Cleanup subscription on unmount
  useEffect(() => {
    return () => {
      stopSubscription()
    }
  }, [])

  // Refetch once the connection is back: anything published during the outage
  // never reached the subscription callback. Safari drops the socket every
  // time the tab is backgrounded, so this is the normal path, not an edge case.
  useEffect(() => {
    if (!selectedGarage) return
    const garageId = selectedGarage.id
    // Merge, never replace: Safari drops the socket every time the tab is
    // backgrounded, so this fires constantly, and replacing here made the
    // conversation flicker away and come back short.
    return appSyncService.onReconnect(() => { fetchMessages(garageId, 'merge') })
  }, [selectedGarage, fetchMessages])

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
      <section className="app-viewport bg-surface flex items-center justify-center">
        <div className="text-center">
          <div className={styles.loadingSpinner}></div>
          <p className={styles.bodyText}>Φόρτωση συνομιλιών...</p>
        </div>
      </section>
    )
  }

  return (
    <section className="app-viewport overflow-hidden bg-surface flex flex-col">
      <div className="px-4 md:px-5 max-w-4xl w-full mx-auto pt-4 pb-4 flex-1 min-h-0 flex flex-col">
        {/* Request and Car Details — capped so an expanded panel scrolls inside
            itself instead of pushing the composer off the screen. */}
        {requestDetails && (
          <div className="mb-4 flex-shrink-0 max-h-[45%] overflow-y-auto">
            <RequestDetailsPanel
              request={requestDetails}
              allowEdit={true}
              onUpdate={(updatedRequest) => {
                setRequestDetails({ ...requestDetails, ...updatedRequest })
                showToast({ type: 'success', title: 'Τα στοιχεία ενημερώθηκαν επιτυχώς' })
              }}
            />
          </div>
        )}

        <div className="bg-surface-container-lowest rounded-2xl shadow-[0_4px_24px_rgba(27,28,28,0.06)] border border-outline-variant/10 overflow-hidden flex-1 min-h-0">
          <div className="flex h-full">
            {/* Sidebar with garages — hidden on mobile, where its fixed 320px
                width left the chat (and its composer) about 30px wide. Phones
                pick a thread from the chats list instead, which deep-links here
                with ?garageId=. */}
            <div className="hidden md:flex w-80 border-r border-outline-variant/10 bg-surface flex-col">
              <div className="p-4 border-b border-outline-variant/10">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/requests/${clientId}/chats/`)}
                    disabled={isNavigating(`/requests/${clientId}/chats/`)}
                    className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-container transition-colors disabled:opacity-60"
                  >
                    {isNavigating(`/requests/${clientId}/chats/`)
                      ? <Spinner size="md" className="text-on-surface" />
                      : <Icon name="arrow_back" size="md" className="text-on-surface" />}
                  </button>
                  <h2 className="text-base font-bold text-on-surface">Συνεργεία</h2>
                </div>
              </div>

              <div className="overflow-y-auto flex-1">
                {garages.length === 0 ? (
                  <div className="p-6 text-center">
                    <div className="w-14 h-14 bg-surface-container rounded-full flex items-center justify-center mx-auto mb-3">
                      <Icon name="chat_bubble_outline" size="lg" className="text-outline" />
                    </div>
                    <p className="text-sm text-secondary">Δεν υπάρχουν συνομιλίες</p>
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {garages.map((garage) => (
                      <button
                        key={garage.id}
                        onClick={() => handleGarageSelect(garage)}
                        className={`w-full p-3 rounded-xl text-left transition-all duration-200 ${
                          selectedGarage?.id === garage.id
                            ? 'bg-primary/10 border border-primary/20'
                            : 'hover:bg-surface-container-low border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Garage Avatar */}
                          <div className="relative flex-shrink-0">
                            {garage.logoUrl ? (
                              <Image
                                src={garage.logoUrl}
                                alt={garage.companyName}
                                width={44}
                                height={44}
                                className="w-11 h-11 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary to-primary-container flex items-center justify-center">
                                <span className="text-on-primary font-bold text-xs">
                                  {getGarageInitials(garage.companyName)}
                                </span>
                              </div>
                            )}
                            {/* Online dot */}
                            {garage.hasUnreadMessages && (
                              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-surface rounded-full" />
                            )}
                          </div>

                          {/* Garage Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-0.5">
                              <h3 className={`text-sm truncate ${
                                garage.hasUnreadMessages ? 'font-bold text-on-surface' : 'font-medium text-on-surface'
                              }`}>
                                {garage.companyName}
                              </h3>
                              {garage.lastMessageTime && (
                                <span className="text-[10px] text-secondary ml-2 flex-shrink-0">
                                  {formatTime(garage.lastMessageTime)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between">
                              {garage.lastMessage && (
                                <p className={`text-xs truncate ${
                                  garage.hasUnreadMessages ? 'text-on-surface font-medium' : 'text-secondary'
                                }`}>
                                  {garage.lastMessage}
                                </p>
                              )}
                              {garage.hasUnreadMessages && (
                                <div className="bg-primary text-on-primary text-[10px] font-bold h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 ml-2">
                                  !
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Main chat area */}
            <div className="flex-1 min-w-0 flex flex-col bg-surface-container-low/50">
              {selectedGarage ? (
                <>
                  {/* Chat header */}
                  <div className="px-5 py-3.5 border-b border-outline-variant/10 bg-surface-container-lowest">
                    <div className="flex items-center gap-3">
                      {/* Mobile back button (hidden on desktop since sidebar is visible) */}
                      <button
                        onClick={() => navigate(`/requests/${clientId}/chats/`)}
                        disabled={isNavigating(`/requests/${clientId}/chats/`)}
                        className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-container transition-colors md:hidden disabled:opacity-60"
                      >
                        {isNavigating(`/requests/${clientId}/chats/`)
                          ? <Spinner size="md" className="text-on-surface" />
                          : <Icon name="arrow_back" size="md" className="text-on-surface" />}
                      </button>
                      <div className="relative">
                        {selectedGarage.logoUrl ? (
                          <Image
                            src={selectedGarage.logoUrl}
                            alt={selectedGarage.companyName}
                            width={40}
                            height={40}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary-container flex items-center justify-center">
                            <span className="text-on-primary font-bold text-xs">
                              {getGarageInitials(selectedGarage.companyName)}
                            </span>
                          </div>
                        )}
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-surface-container-lowest rounded-full" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-on-surface">{selectedGarage.companyName}</h3>
                        <p className="text-[11px] text-green-600 font-medium">Online</p>
                      </div>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
                    <LoadMoreButton
                      hasMore={!!olderCursor}
                      loading={loadingOlder}
                      onClick={loadOlderMessages}
                      label="Παλαιότερα μηνύματα"
                      icon="history"
                    />
                    {messages.length === 0 ? (
                      <div className="text-center py-16">
                        <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center mx-auto mb-4">
                          <Icon name="chat_bubble_outline" size="xl" className="text-outline" />
                        </div>
                        <p className="text-sm font-medium text-on-surface mb-1">Δεν υπάρχουν μηνύματα ακόμα</p>
                        <p className="text-xs text-secondary">Ξεκινήστε τη συνομιλία!</p>
                      </div>
                    ) : (
                      messages.map((message, index) => {
                        const isClient = message.senderType === 'client'
                        const showDate = index === 0 ||
                          formatDate(message.timestamp) !== formatDate(messages[index - 1].timestamp)

                        // Ensure we have a valid key - use index as fallback if message.id is missing
                        const messageKey = message.id || `message-${index}-${message.timestamp}`

                        return (
                          <div key={messageKey}>
                            {showDate && (
                              <div className="flex justify-center my-4">
                                <span className="text-[10px] uppercase tracking-[0.15em] text-secondary bg-surface-container px-4 py-1 rounded-full">
                                  {formatDate(message.timestamp)}
                                </span>
                              </div>
                            )}
                            <div className={`flex ${isClient ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[75%] lg:max-w-[60%] px-4 py-2.5 ${
                                isClient
                                  ? 'machined-gradient text-white rounded-xl rounded-tr-none'
                                  : 'bg-surface-container-low text-on-surface rounded-xl rounded-tl-none'
                              }`}>
                                {(message.attachments?.length ?? 0) > 0 && (
                                  <div className="mb-1.5 -mx-1">
                                    <ChatAttachments
                                      attachments={message.attachments ?? []}
                                      onOwnBubble={isClient}
                                    />
                                  </div>
                                )}
                                {message.message && (
                                  <p className="text-sm leading-relaxed">{message.message}</p>
                                )}
                                <div className={`flex items-center gap-1 mt-1 ${isClient ? 'justify-end' : 'justify-start'}`}>
                                  <p className={`text-[10px] ${
                                    isClient ? 'text-white/70' : 'text-secondary'
                                  }`}>
                                    {formatTime(message.timestamp)}
                                  </p>
                                  {isClient && (
                                    <Icon name="done_all" size="sm" className="text-white/70" />
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                    {/* Scroll target element */}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Message input / Read-only notice */}
                  {isReadOnly ? (
                    <div className="px-5 py-3 border-t border-outline-variant/10 bg-surface-container-lowest/80 backdrop-blur-sm">
                      <div className="rounded-xl bg-surface-container px-4 py-3 flex items-center gap-3">
                        <Icon name="lock" size="sm" className="text-secondary" />
                        <p className="text-xs text-secondary">
                          Το ραντεβού κλείστηκε με άλλο συνεργείο, οπότε αυτή η συνομιλία είναι πλέον μόνο για ανάγνωση.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 py-3 border-t border-outline-variant/10 bg-surface-container-lowest/80 backdrop-blur-sm">
                      <AttachmentPreviewStrip
                        files={attachments.pending}
                        onRemove={attachments.removeFile}
                        disabled={sending}
                      />
                      <div className="flex items-end gap-2">
                        {/* Attach photos */}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleFilesPicked}
                          className="hidden"
                        />
                        {/* `capture` opens the camera straight away. Mobile only:
                            on desktop it degrades to a second file picker. */}
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
                          disabled={sending || attachments.isFull}
                          title="Λήψη φωτογραφίας"
                          className="md:hidden w-10 h-10 rounded-full bg-surface-container flex items-center justify-center hover:bg-surface-container-high transition-colors flex-shrink-0 mb-0.5 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                        >
                          <Icon name="photo_camera" size="md" filled className="text-on-surface-variant" />
                        </button>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={sending || attachments.isFull}
                          title={
                            attachments.isFull
                              ? `Έως ${MAX_CHAT_ATTACHMENTS} φωτογραφίες ανά μήνυμα`
                              : 'Επισύναψη φωτογραφίας'
                          }
                          className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center hover:bg-surface-container-high transition-colors flex-shrink-0 mb-0.5 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                        >
                          <Icon name="add_a_photo" size="md" className="text-on-surface-variant" />
                        </button>

                        {/* Text input */}
                        <div className="flex-1">
                          <textarea
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                sendMessage()
                              }
                            }}
                            placeholder={attachments.hasPending ? 'Προσθέστε λεζάντα (προαιρετικά)...' : 'Γράψτε μήνυμα...'}
                            rows={1}
                            className="w-full bg-surface-container-low border-0 rounded-2xl px-4 py-2.5 text-sm font-medium text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary focus:bg-surface-container-lowest transition-all resize-none max-h-24"
                            disabled={sending}
                          />
                        </div>

                        {/* Send button */}
                        <button
                          onClick={sendMessage}
                          disabled={(!newMessage.trim() && !attachments.hasPending) || sending}
                          className="w-10 h-10 rounded-full machined-gradient flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 shadow-lg shadow-primary/20 flex-shrink-0 mb-0.5"
                        >
                          {sending ? (
                            <Spinner size="sm" className="text-white" />
                          ) : (
                            <Icon name="send" filled size="sm" className="text-white" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-20 h-20 bg-surface-container rounded-full flex items-center justify-center mx-auto mb-4">
                      <Icon name="chat_bubble_outline" size="xl" className="text-outline" />
                    </div>
                    <p className="text-sm font-medium text-on-surface mb-1">Επιλέξτε ένα συνεργείο</p>
                    <p className="text-xs text-secondary">για να ξεκινήσετε τη συνομιλία</p>
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
