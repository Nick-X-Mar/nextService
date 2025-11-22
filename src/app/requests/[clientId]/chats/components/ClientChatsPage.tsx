'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { HiArrowLeft, HiChatBubbleLeftRight, HiClock, HiCalendar, HiUser, HiEye } from 'react-icons/hi2'
import { styles } from '../../../../../styles/styles'
import { useToast } from '../../../../../hooks/useToast'
import ClientNavigation from '../../../../../components/ClientNavigation'
import SegmentedControl from '../../../../../components/SegmentedControl'
import { ServiceRequestStatus } from '../../../../../types/statuses'
import type { ServiceRequest } from '../../../../../types/requests'

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

  const getStatusIcon = (status: ServiceRequestStatus) => {
    switch (status) {
      case ServiceRequestStatus.APPOINTMENT:
        return <HiCalendar className="h-5 w-5 text-blue-600" />
      case ServiceRequestStatus.PENDING:
        return <HiClock className="h-5 w-5 text-yellow-600" />
      case ServiceRequestStatus.IN_PROGRESS:
        return <HiClock className="h-5 w-5 text-blue-600" />
      case ServiceRequestStatus.COMPLETED:
        return <HiClock className="h-5 w-5 text-green-600" />
      case ServiceRequestStatus.CANCELLED:
        return <HiClock className="h-5 w-5 text-red-600" />
      default:
        return <HiClock className="h-5 w-5 text-gray-600" />
    }
  }

  const getStatusText = (status: ServiceRequestStatus) => {
    switch (status) {
      case ServiceRequestStatus.APPOINTMENT:
        return 'Ραντεβού'
      case ServiceRequestStatus.PENDING:
        return 'Εκκρεμές'
      case ServiceRequestStatus.IN_PROGRESS:
        return 'Σε Εξέλιξη'
      case ServiceRequestStatus.COMPLETED:
        return 'Ολοκληρωμένο'
      case ServiceRequestStatus.CANCELLED:
        return 'Ακυρωμένο'
      default:
        return 'Άγνωστο'
    }
  }

  const getStatusColor = (status: ServiceRequestStatus) => {
    switch (status) {
      case ServiceRequestStatus.APPOINTMENT:
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case ServiceRequestStatus.PENDING:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case ServiceRequestStatus.IN_PROGRESS:
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case ServiceRequestStatus.COMPLETED:
        return 'bg-green-100 text-green-800 border-green-200'
      case ServiceRequestStatus.CANCELLED:
        return 'bg-red-100 text-red-800 border-red-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getCategoryText = (category: string) => {
    switch (category) {
      case 'service':
        return 'Συντήρηση'
      case 'fanopeia':
        return 'Φανοποιεία'
      case 'oils':
        return 'Λάδια & Υγρά'
      case 'disk':
        return 'Δισκόφρενα'
      default:
        return category
    }
  }

  const handleChatClick = (requestId: string, garageId?: string) => {
    // Navigate to the individual chat page for this request
    if (garageId) {
      router.push(`/requests/${clientId}/chats/${requestId}?garageId=${garageId}`)
    } else {
      router.push(`/requests/${clientId}/chats/${requestId}`)
    }
  }

  const isPastAppointment = (appointmentDate?: string) => {
    if (!appointmentDate) return false
    return new Date(appointmentDate) < new Date()
  }

  const renderConversationCard = (
    request: ChatRequest | UnsuccessfulConversation,
    isDisabled: boolean = false,
    garageName?: string
  ) => {
    const isUnsuccessful = 'garageName' in request
    const chatRequest = isUnsuccessful ? request.request : request
    const lastMessage = isUnsuccessful ? request.lastMessage : request.lastMessage
    const unreadCount = isUnsuccessful ? request.unreadCount : request.unreadCount

    return (
      <div 
        key={isUnsuccessful ? `${request.requestId}-${request.garageId}` : request.id}
        className={`${styles.card} transition-all duration-200 ${
          isDisabled 
            ? 'opacity-50 cursor-not-allowed' 
            : 'hover:shadow-lg hover:border-orange-300 cursor-pointer'
        }`}
        onClick={() => !isDisabled && handleChatClick(
          chatRequest.id, 
          isUnsuccessful ? request.garageId : undefined
        )}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {/* Header with status and unread count */}
            <div className="flex items-center gap-3 mb-3">
              <HiChatBubbleLeftRight className="h-5 w-5 text-orange-600" />
              {isUnsuccessful && garageName && (
                <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800 border border-gray-200">
                  {garageName}
                </span>
              )}
              <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(chatRequest.status)}`}>
                {getStatusText(chatRequest.status)}
              </span>
              {unreadCount && unreadCount > 0 && (
                <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                  {unreadCount} νέα
                </span>
              )}
              {isDisabled && (
                <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                  Παρελθόν
                </span>
              )}
            </div>

            {/* Vehicle info */}
            {chatRequest.vehicle && (
              <div className="mb-3">
                <h3 className="font-semibold text-gray-900">
                  {chatRequest.vehicle.brand} {chatRequest.vehicle.model} ({chatRequest.vehicle.modelYear})
                </h3>
                <p className="text-sm text-gray-600">
                  Κατηγορία: {getCategoryText(chatRequest.category)}
                </p>
              </div>
            )}

            {/* Description */}
            <p className="text-gray-700 mb-3 line-clamp-2">
              {chatRequest.description}
            </p>

            {/* Appointment Date - Prominent (only for appointments tab) */}
            {chatRequest.status === ServiceRequestStatus.APPOINTMENT && chatRequest.appointmentDate && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                <div className="flex items-center gap-2">
                  <HiCalendar className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-blue-900">
                      Ημερομηνία Ραντεβού
                    </p>
                    <p className="text-lg font-bold text-blue-700">
                      {formatAppointmentDate(chatRequest.appointmentDate)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Last message or request details */}
            {lastMessage ? (
              <div className="bg-gray-50 rounded-lg p-3 mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-500">
                    {lastMessage.sender === 'client' ? 'Εσείς' : 'Συνεργείο'}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatLastMessageTime(lastMessage.timestamp)}
                  </span>
                </div>
                <p className="text-sm text-gray-700 line-clamp-2">
                  {lastMessage.content}
                </p>
              </div>
            ) : (
              <div className="text-sm text-gray-500 mb-3">
                Δεν υπάρχουν ακόμα μηνύματα
              </div>
            )}

            {/* Details row */}
            <div className="flex items-center justify-between text-sm text-gray-500">
              <div className="flex items-center gap-4">
                {chatRequest.status !== ServiceRequestStatus.APPOINTMENT && (
                  <div className="flex items-center gap-1">
                    <HiCalendar className="h-4 w-4" />
                    <span>{formatDate(chatRequest.createdAt)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Price and Chat Button */}
          <div className="ml-4 flex flex-col items-end gap-3">
            {/* Price - Right aligned */}
            {(chatRequest.appointmentPrice || chatRequest.estimatedCost) && (
              <div className="text-right">
                <div className="text-2xl font-bold text-orange-600">
                  €{chatRequest.appointmentPrice || chatRequest.estimatedCost}
                </div>
                {chatRequest.status !== ServiceRequestStatus.APPOINTMENT && (
                  <p className="text-xs text-gray-500 mt-1">
                    {formatDate(chatRequest.createdAt)}
                  </p>
                )}
              </div>
            )}

            {/* Chat Button */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (!isDisabled) {
                  handleChatClick(chatRequest.id, isUnsuccessful ? request.garageId : undefined)
                }
              }}
              disabled={isDisabled}
              className={`${styles.btnPrimary} flex items-center gap-2 px-4 py-2 text-sm ${
                isDisabled ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <HiEye className="h-4 w-4" />
              Άνοιγμα Συνομιλίας
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderEmptyState = (message: string, description: string) => (
    <div className="text-center py-12">
      <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <HiChatBubbleLeftRight className="h-12 w-12 text-gray-400" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">{message}</h3>
      <p className="text-gray-500 mb-6">{description}</p>
      <button
        onClick={() => router.push(`/requests/${clientId}`)}
        className={styles.btnPrimary}
      >
        Δείτε τα Αιτήματά σας
      </button>
    </div>
  )

  if (isLoading) {
    return (
      <section className="bg-white min-h-screen">
        <div className={styles.pageCenter}>
          <div className="text-center">
            <div className={styles.loadingSpinner}></div>
            <p className={styles.bodyText}>Φόρτωση συνομιλιών...</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="bg-white min-h-screen">
      <ClientNavigation clientId={clientId} />
      <div className={`${styles.container} py-24`}>
        <div className="text-center mb-8">
          <h1 className={styles.pageTitle}>
            <span className={styles.titleHighlight}>Συνομιλιών</span>
          </h1>
          <p className={`mt-3 max-w-md mx-auto ${styles.bodyText} sm:text-lg md:mt-5 md:text-xl md:max-w-3xl`}>
            Δείτε όλες τις συνομιλίες σας με τα συνεργεία
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          {/* Tab Control */}
          <div className="mb-6">
            <SegmentedControl
              options={[
                { value: 'pending', label: 'Εκκρεμείς Συνομιλίες' },
                { value: 'appointments', label: 'Ραντεβού' },
                { value: 'unsuccessful', label: 'Απορριφθείσες Προσφορές' }
              ]}
              value={activeTab}
              onChange={(value) => setActiveTab(value as TabType)}
              variant="orange"
              className="max-w-2xl mx-auto"
            />
          </div>

          {/* Tab Content */}
          {activeTab === 'pending' && (
            <>
              {pendingConversations.length > 0 ? (
                <div className="space-y-4">
                  {pendingConversations.map((request) => 
                    renderConversationCard(request, false)
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
                <div className="space-y-4">
                  {appointments.map((request) => {
                    const isPast = isPastAppointment(request.appointmentDate)
                    return renderConversationCard(request, isPast)
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
                <div className="space-y-4">
                  {unsuccessfulConversations.map((conversation) => 
                    renderConversationCard(conversation, false, conversation.garageName)
                  )}
                </div>
              ) : (
                renderEmptyState(
                  'Δεν υπάρχουν συνομιλίες που δεν κατέλληξαν σε ραντεβού',
                  'Όλες οι συνομιλίες σας έχουν οδηγήσει σε ραντεβού ή είναι ακόμα σε αναμονή.'
                )
              )}
            </>
          )}

          {/* Back Button */}
          <div className="mt-8 text-center">
            <button
              onClick={() => router.push(`/requests/${clientId}`)}
              className={`inline-flex items-center gap-2 ${styles.linkText} font-medium transition-colors duration-200`}
            >
              <HiArrowLeft className="h-4 w-4" />
              Επιστροφή στα Αιτήματα
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
