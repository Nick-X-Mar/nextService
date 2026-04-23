'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/ui/Icon'
import { useToast } from '../../../../../hooks/useToast'
import { ServiceRequestStatus } from '../../../../../types/statuses'
import type { ServiceRequest } from '../../../../../types/requests'
import { getCategoryText } from '@/utils/categoryLabels'

interface ChatRequest extends Omit<ServiceRequest, 'vehicle'> {
  vehicle?: {
    brand: string
    model: string
    modelYear: string
  }
  lastMessage?: {
    content: string
    timestamp: string
    sender: 'client' | 'garage'
  }
  unreadCount?: number
}

interface UnsuccessfulConversation {
  requestId: string
  garageId: string
  garageName: string
  garageLogoUrl?: string
  request: ChatRequest
  lastMessage?: {
    content: string
    timestamp: string
    sender: 'client' | 'garage'
  }
  unreadCount?: number
}

interface ClientChatsPageProps {
  clientId: string
}

type TabType = 'pending' | 'appointments' | 'unsuccessful'

export default function ClientChatsPage({ clientId }: ClientChatsPageProps) {
  const router = useRouter()
  const { error } = useToast()
  const [activeTab, setActiveTab] = useState<TabType>('pending')
  const [pendingConversations, setPendingConversations] = useState<ChatRequest[]>([])
  const [appointments, setAppointments] = useState<ChatRequest[]>([])
  const [unsuccessfulConversations, setUnsuccessfulConversations] = useState<UnsuccessfulConversation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const loadPendingConversations = async () => {
    try {
      const response = await fetch(`/api/requests?clientId=${clientId}`)

      if (!response.ok) {
        throw new Error('Failed to fetch requests')
      }

      const result = await response.json()

      if (result.success) {
        // Filter requests with status PENDING that have messages
        const pendingRequests = result.requests.filter((request: ChatRequest) =>
          request.status === ServiceRequestStatus.PENDING
        )

        // For each request, check if it has messages
        const requestsWithMessages = await Promise.all(
          pendingRequests.map(async (request: ChatRequest) => {
            try {
              const chatResponse = await fetch(`/api/chat/${request.id}/messages`)
              if (chatResponse.ok) {
                const chatData = await chatResponse.json()
                if (chatData.messages && chatData.messages.length > 0) {
                  const lastMessage = chatData.messages[chatData.messages.length - 1]
                  return {
                    ...request,
                    lastMessage: {
                      content: lastMessage.message || lastMessage.content || '',
                      timestamp: lastMessage.timestamp,
                      sender: lastMessage.senderType || lastMessage.sender || 'garage'
                    },
                    unreadCount: chatData.messages.filter((msg: any) =>
                      (msg.senderType === 'garage' || msg.sender === 'garage') && !msg.read
                    ).length
                  }
                }
              }
            } catch (error) {
              console.error(`Error fetching messages for request ${request.id}:`, error)
            }
            return null
          })
        )

        setPendingConversations(requestsWithMessages.filter((r): r is ChatRequest => r !== null))
      } else {
        console.error('API error:', result.error)
        setPendingConversations([])
      }
    } catch (error) {
      console.error('Error loading pending conversations:', error)
      setPendingConversations([])
    }
  }

  const loadAppointments = async () => {
    try {
      const response = await fetch(`/api/requests?clientId=${clientId}`)

      if (!response.ok) {
        throw new Error('Failed to fetch requests')
      }

      const result = await response.json()

      if (result.success) {
        // Filter requests with status APPOINTMENT that have appointmentDate
        const appointmentRequests = result.requests.filter((request: ChatRequest) =>
          request.status === ServiceRequestStatus.APPOINTMENT &&
          request.appointmentDate
        )

        // For each request, get the last message
        const requestsWithMessages = await Promise.all(
          appointmentRequests.map(async (request: ChatRequest) => {
            try {
              const chatResponse = await fetch(`/api/chat/${request.id}/messages`)
              if (chatResponse.ok) {
                const chatData = await chatResponse.json()
                if (chatData.messages && chatData.messages.length > 0) {
                  const lastMessage = chatData.messages[chatData.messages.length - 1]
                  return {
                    ...request,
                    lastMessage: {
                      content: lastMessage.message || lastMessage.content || '',
                      timestamp: lastMessage.timestamp,
                      sender: lastMessage.senderType || lastMessage.sender || 'garage'
                    },
                    unreadCount: chatData.messages.filter((msg: any) =>
                      (msg.senderType === 'garage' || msg.sender === 'garage') && !msg.read
                    ).length
                  }
                }
              }
            } catch (error) {
              console.error(`Error fetching messages for request ${request.id}:`, error)
            }
            return request
          })
        )

        // Sort: Future appointments first (ascending), then past appointments (descending)
        const now = new Date()
        const future = requestsWithMessages.filter((r) =>
          r.appointmentDate && new Date(r.appointmentDate) >= now
        ).sort((a, b) => {
          const dateA = new Date(a.appointmentDate || '').getTime()
          const dateB = new Date(b.appointmentDate || '').getTime()
          return dateA - dateB
        })

        const past = requestsWithMessages.filter((r) =>
          r.appointmentDate && new Date(r.appointmentDate) < now
        ).sort((a, b) => {
          const dateA = new Date(a.appointmentDate || '').getTime()
          const dateB = new Date(b.appointmentDate || '').getTime()
          return dateB - dateA
        })

        setAppointments([...future, ...past])
      } else {
        console.error('API error:', result.error)
        setAppointments([])
      }
    } catch (error) {
      console.error('Error loading appointments:', error)
      setAppointments([])
    }
  }

  const loadUnsuccessfulConversations = async () => {
    try {
      const response = await fetch(`/api/requests?clientId=${clientId}`)

      if (!response.ok) {
        throw new Error('Failed to fetch requests')
      }

      const result = await response.json()

      if (result.success) {
        // Filter requests with acceptedOfferId
        const requestsWithAcceptedOffer = result.requests.filter((request: ChatRequest) =>
          request.acceptedOfferId
        )

        const unsuccessfulConversationsList: UnsuccessfulConversation[] = []

        // For each request with accepted offer, find garages that chatted but didn't get accepted
        await Promise.all(
          requestsWithAcceptedOffer.map(async (request: ChatRequest) => {
            try {
              // Get all offers for this request
              const offersResponse = await fetch(`/api/offers?serviceRequestId=${request.id}`)
              if (!offersResponse.ok) return

              const offersData = await offersResponse.json()
              if (!offersData.success || !offersData.offers) return

              // Find the accepted offer's garageId
              const acceptedOffer = offersData.offers.find((offer: any) =>
                offer.id === request.acceptedOfferId
              )
              if (!acceptedOffer) return

              const acceptedGarageId = acceptedOffer.garageId

              // Get all garages that sent messages for this request
              const garagesResponse = await fetch(`/api/chat/${request.id}/garages`)
              if (!garagesResponse.ok) return

              const garagesData = await garagesResponse.json()
              if (!garagesData.success || !garagesData.garages) return

              // Filter garages that have messages but their offer was not accepted
              const unsuccessfulGarages = garagesData.garages.filter((garage: any) =>
                garage.id !== acceptedGarageId
              )

              // Get messages for each unsuccessful garage to get last message
              for (const garage of unsuccessfulGarages) {
                try {
                  const messagesResponse = await fetch(`/api/chat/${request.id}/messages`)
                  if (messagesResponse.ok) {
                    const messagesData = await messagesResponse.json()
                    if (messagesData.messages) {
                      // Filter messages from this garage
                      const garageMessages = messagesData.messages.filter((msg: any) =>
                        msg.senderType === 'garage' && msg.senderId === garage.id
                      )

                      if (garageMessages.length > 0) {
                        const lastMessage = garageMessages.sort((a: any, b: any) =>
                          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                        )[0]

                        unsuccessfulConversationsList.push({
                          requestId: request.id,
                          garageId: garage.id,
                          garageName: garage.companyName || 'Συνεργείο',
                          garageLogoUrl: garage.logoUrl,
                          request: {
                            ...request,
                            vehicle: request.vehicle
                          },
                          lastMessage: {
                            content: lastMessage.message || lastMessage.content || '',
                            timestamp: lastMessage.timestamp,
                            sender: lastMessage.senderType || 'garage'
                          },
                          unreadCount: garageMessages.filter((msg: any) =>
                            (msg.senderType === 'garage' || msg.sender === 'garage') && !msg.read
                          ).length
                        })
                      }
                    }
                  }
                } catch (error) {
                  console.error(`Error fetching messages for garage ${garage.id}:`, error)
                }
              }
            } catch (error) {
              console.error(`Error processing request ${request.id}:`, error)
            }
          })
        )

        setUnsuccessfulConversations(unsuccessfulConversationsList)
      } else {
        console.error('API error:', result.error)
        setUnsuccessfulConversations([])
      }
    } catch (error) {
      console.error('Error loading unsuccessful conversations:', error)
      setUnsuccessfulConversations([])
    }
  }

  const loadAllData = async () => {
    setIsLoading(true)
    await Promise.all([
      loadPendingConversations(),
      loadAppointments(),
      loadUnsuccessfulConversations()
    ])
    setIsLoading(false)
  }

  useEffect(() => {
    loadAllData()
  }, [clientId])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('el-GR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatAppointmentDate = (dateString: string) => {
    const date = new Date(`${dateString}T00:00:00`)
    return date.toLocaleDateString('el-GR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      weekday: 'long'
    })
  }

  const formatLastMessageTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)

    if (diffInHours < 24) {
      return date.toLocaleTimeString('el-GR', {
        hour: '2-digit',
        minute: '2-digit'
      })
    } else {
      return date.toLocaleDateString('el-GR', {
        day: '2-digit',
        month: '2-digit'
      })
    }
  }

  const handleChatClick = (requestId: string, garageId?: string) => {
    // Navigate to the individual chat page for this request
    if (garageId) {
      router.push(`/requests/${clientId}/chats/${requestId}/?garageId=${garageId}`)
    } else {
      router.push(`/requests/${clientId}/chats/${requestId}/`)
    }
  }

  const isPastAppointment = (appointmentDate?: string) => {
    if (!appointmentDate) return false
    return new Date(appointmentDate) < new Date()
  }

  const renderRequestCard = (
    request: ChatRequest | UnsuccessfulConversation,
    isCompleted: boolean = false,
    garageName?: string
  ) => {
    const isUnsuccessful = 'garageName' in request
    const chatRequest = isUnsuccessful ? request.request : request
    const lastMessage = isUnsuccessful ? request.lastMessage : request.lastMessage
    const unreadCount = isUnsuccessful ? request.unreadCount : request.unreadCount
    const hasUnread = unreadCount && unreadCount > 0

    // Get thumbnail from photos or photoUrls
    const thumbnailUrl = chatRequest.photos?.[0]?.s3Url || chatRequest.photoUrls?.[0]

    const vehicleName = chatRequest.vehicle
      ? `${chatRequest.vehicle.brand} ${chatRequest.vehicle.model}`
      : 'Αίτημα'
    const vehicleYear = chatRequest.vehicle?.modelYear || ''

    const isActive = !isCompleted
    const statusLabel = isActive ? 'ΕΝΕΡΓΟ' : 'ΟΛΟΚΛΗΡΩΘΗΚΕ'
    const statusClasses = isActive
      ? 'bg-primary/10 text-primary'
      : 'bg-secondary-container text-on-secondary-container'

    return (
      <div
        key={isUnsuccessful ? `${request.requestId}-${request.garageId}` : request.id}
        className={`${
          isActive
            ? 'bg-surface-container-lowest border-l-4 border-primary shadow-[0_4px_24px_rgba(27,28,28,0.02)]'
            : 'bg-surface-container-low border-l-4 border-transparent opacity-80'
        } p-5 rounded-xl transition-all duration-200 cursor-pointer hover:shadow-md active:scale-[0.99]`}
        onClick={() => handleChatClick(
          chatRequest.id,
          isUnsuccessful ? request.garageId : undefined
        )}
      >
        <div className="flex items-start gap-4">
          {/* Vehicle Thumbnail */}
          <div className="flex-shrink-0">
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={vehicleName}
                className={`w-16 h-16 rounded-lg object-cover ${isCompleted ? 'grayscale' : ''}`}
              />
            ) : (
              <div className={`w-16 h-16 rounded-lg bg-surface-container flex items-center justify-center ${isCompleted ? 'grayscale' : ''}`}>
                <Icon name="directions_car" size="lg" className="text-on-surface-variant" />
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Title Row: Vehicle name + Status badge */}
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="font-bold text-lg text-on-surface truncate">
                  {isUnsuccessful && garageName ? garageName : vehicleName}
                  {vehicleYear && !isUnsuccessful ? ` ${vehicleYear}` : ''}
                </h3>
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${statusClasses}`}>
                {statusLabel}
              </span>
            </div>

            {/* Service type */}
            <p className="text-xs text-on-surface-variant uppercase tracking-wide mb-2">
              {getCategoryText(chatRequest.category)}
            </p>

            {/* Bottom section: message/offer info + date */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                {lastMessage ? (
                  <p className={`text-sm truncate ${hasUnread ? 'text-on-surface font-medium' : 'text-on-surface-variant'}`}>
                    {lastMessage.sender === 'client' ? 'Εσείς: ' : ''}
                    {lastMessage.content}
                  </p>
                ) : (
                  <p className="text-sm text-on-surface-variant italic">
                    Αναμονή για προσφορές...
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                {hasUnread && (
                  <div className="bg-primary text-on-primary text-[10px] font-bold h-5 min-w-5 px-1 rounded-full flex items-center justify-center">
                    {unreadCount}
                  </div>
                )}
                {lastMessage && (
                  <span className="text-xs text-on-surface-variant">
                    {formatLastMessageTime(lastMessage.timestamp)}
                  </span>
                )}
              </div>
            </div>

            {/* Appointment date badge */}
            {chatRequest.status === ServiceRequestStatus.APPOINTMENT && chatRequest.appointmentDate && (
              <div className="mt-2 flex items-center gap-1.5 bg-surface-container rounded-lg px-2.5 py-1.5 w-fit">
                <Icon name="calendar_month" size="sm" className="text-primary" />
                <span className="text-[11px] font-bold text-on-surface">
                  {formatAppointmentDate(chatRequest.appointmentDate)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  const renderEmptyState = (message: string, description: string) => (
    <div className="text-center py-16">
      <div className="mx-auto w-20 h-20 bg-surface-container rounded-full flex items-center justify-center mb-5">
        <Icon name="chat_bubble_outline" size="xl" className="text-on-surface-variant" />
      </div>
      <h3 className="text-lg font-bold text-on-surface mb-2">{message}</h3>
      <p className="text-sm text-on-surface-variant mb-8 max-w-sm mx-auto">{description}</p>
      <button
        onClick={() => router.push(`/requests/${clientId}/`)}
        className="inline-flex items-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-full font-medium text-sm hover:opacity-90 transition-opacity mx-auto"
      >
        <Icon name="list_alt" size="sm" />
        Δείτε τα Αιτήματά σας
      </button>
    </div>
  )

  if (isLoading) {
    return (
      <section className="bg-surface">
        <div className="max-w-2xl mx-auto px-4 pt-2 pb-4">
          <div className="text-center py-20">
            <div className="animate-spin w-8 h-8 border-3 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-sm text-on-surface-variant">Φόρτωση συνομιλιών...</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="bg-surface">
      <div className="max-w-2xl mx-auto px-4 pt-2 pb-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-on-surface">
            Μηνύματα
          </h1>
          <button className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center">
            <Icon name="tune" size="md" className="text-on-surface-variant" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="mb-5">
          <div className="relative">
            <Icon name="search" size="md" className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="text"
              placeholder="Αναζήτηση συνομιλιών..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-12 bg-surface-container-highest border-0 rounded-full pl-12 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary transition-all"
            />
          </div>
        </div>

        {/* Status Filter Chips */}
        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeTab === 'pending'
                ? 'bg-primary text-on-primary'
                : 'bg-secondary-container text-on-secondary-container'
            }`}
          >
            Όλα
          </button>
          <button
            onClick={() => setActiveTab('appointments')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeTab === 'appointments'
                ? 'bg-primary text-on-primary'
                : 'bg-secondary-container text-on-secondary-container'
            }`}
          >
            Ενεργά
          </button>
          <button
            onClick={() => setActiveTab('unsuccessful')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeTab === 'unsuccessful'
                ? 'bg-primary text-on-primary'
                : 'bg-secondary-container text-on-secondary-container'
            }`}
          >
            Ολοκληρωμένα
          </button>
        </div>

        {/* Request Cards List */}
        {activeTab === 'pending' && (
          <>
            {pendingConversations.length > 0 ? (
              <div className="space-y-3">
                {pendingConversations.map((request) =>
                  renderRequestCard(request, false)
                )}
              </div>
            ) : (
              renderEmptyState(
                'Δεν υπάρχουν εκκρεμείς συνομιλίες',
                'Δεν έχετε ακόμα συνομιλίες σε αναμονή. Όταν ένα συνεργείο απαντήσει στο αίτημά σας, θα εμφανιστεί εδώ.'
              )
            )}
          </>
        )}

        {activeTab === 'appointments' && (
          <>
            {appointments.length > 0 ? (
              <div className="space-y-3">
                {appointments.map((request) => {
                  const isPast = isPastAppointment(request.appointmentDate)
                  return renderRequestCard(request, isPast)
                })}
              </div>
            ) : (
              renderEmptyState(
                'Δεν υπάρχουν ραντεβού',
                'Δεν έχετε προγραμματισμένα ραντεβού. Όταν αποδεχτείτε μια προσφορά, θα εμφανιστεί εδώ.'
              )
            )}
          </>
        )}

        {activeTab === 'unsuccessful' && (
          <>
            {unsuccessfulConversations.length > 0 ? (
              <div className="space-y-3">
                {unsuccessfulConversations.map((conversation) =>
                  renderRequestCard(conversation, true, conversation.garageName)
                )}
              </div>
            ) : (
              renderEmptyState(
                'Δεν υπάρχουν ολοκληρωμένες συνομιλίες',
                'Όλες οι συνομιλίες σας έχουν οδηγήσει σε ραντεβού ή είναι ακόμα σε αναμονή.'
              )
            )}
          </>
        )}
      </div>
    </section>
  )
}
