'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { styles } from '@/styles/styles'
import { useToast } from '@/hooks/useToast'
import { ServiceRequestStatus } from '@/types/statuses'
import type { ServiceRequest } from '@/types/requests'
import Icon from '@/components/ui/Icon'

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

interface GarageChatsPageProps {
  garageId: string
}

export default function GarageChatsPage({ garageId }: GarageChatsPageProps) {
  const router = useRouter()
  const { error } = useToast()
  const [chatRequests, setChatRequests] = useState<ChatRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [garageData, setGarageData] = useState<any>(null)

  useEffect(() => {
    loadGarageData()
    loadChatRequests()
  }, [garageId])

  const loadGarageData = async () => {
    try {
      const response = await fetch(`/api/garage/${garageId}`)
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setGarageData(data.garage)
        }
      }
    } catch (error) {
      console.error('Error loading garage data:', error)
    }
  }

  const loadChatRequests = async () => {
    try {
      setIsLoading(true)

      // Get all offers made by this garage
      const offersResponse = await fetch(`/api/garage/offers?garageId=${garageId}`)
      if (!offersResponse.ok) {
        throw new Error('Failed to fetch offers')
      }

      const offersData = await offersResponse.json()

      if (!offersData.success || !offersData.offers) {
        setChatRequests([])
        setIsLoading(false)
        return
      }

      // Get unique request IDs from offers
      const requestIds: string[] = [...new Set<string>(offersData.offers.map((offer: any) => offer.serviceRequestId as string))]

      if (requestIds.length === 0) {
        setChatRequests([])
        setIsLoading(false)
        return
      }

      // For each request, get the full request data
      const requestsWithDetails = await Promise.all(
        requestIds.map(async (requestId: string) => {
          try {
            const requestResponse = await fetch(`/api/requests/${requestId}`)
            if (requestResponse.ok) {
              const requestData = await requestResponse.json()
              if (requestData.success && requestData.request) {
                return requestData.request
              }
            }
          } catch (error) {
            console.error(`Error fetching request ${requestId}:`, error)
          }
          return null
        })
      )

      // Filter requests where status is PENDING or IN_PROGRESS (not APPOINTMENT, not CANCELLED, not COMPLETED)
      const openRequests = requestsWithDetails.filter((request: any) =>
        request &&
        (request.status === ServiceRequestStatus.PENDING ||
         request.status === ServiceRequestStatus.IN_PROGRESS) &&
        request.status !== ServiceRequestStatus.APPOINTMENT &&
        request.status !== ServiceRequestStatus.CANCELLED &&
        request.status !== ServiceRequestStatus.COMPLETED
      )

      // For each request, get the last message
      const requestsWithMessages = await Promise.all(
        openRequests.map(async (request: ChatRequest) => {
          try {
            const chatResponse = await fetch(`/api/chat/${request.id}/messages?garageId=${garageId}`)
            if (chatResponse.ok) {
              const chatData = await chatResponse.json()
              if (chatData.messages && chatData.messages.length > 0) {
                const lastMessage = chatData.messages[chatData.messages.length - 1]
                return {
                  ...request,
                  lastMessage: {
                    content: lastMessage.content,
                    timestamp: lastMessage.timestamp,
                    sender: (lastMessage.senderType === 'garage' ? 'garage' : 'client') as 'garage' | 'client'
                  },
                  unreadCount: chatData.messages.filter((msg: any) =>
                    msg.senderType === 'client' && !msg.read
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

      setChatRequests(requestsWithMessages)
    } catch (err) {
      console.error('Error loading chat requests:', err)
      setChatRequests([])
      error('Σφάλμα', 'Δεν ήταν δυνατή η φόρτωση των συνομιλιών')
    } finally {
      setIsLoading(false)
    }
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

  const getStatusText = (status: ServiceRequestStatus) => {
    switch (status) {
      case ServiceRequestStatus.PENDING:
        return 'Εκκρεμές'
      case ServiceRequestStatus.IN_PROGRESS:
        return 'Σε Εξέλιξη'
      default:
        return 'Άγνωστο'
    }
  }

  const getStatusStyle = (status: ServiceRequestStatus) => {
    switch (status) {
      case ServiceRequestStatus.PENDING:
        return styles.statusPending
      case ServiceRequestStatus.IN_PROGRESS:
        return styles.statusInProgress
      default:
        return 'text-[0.65rem] font-black uppercase tracking-[0.1em] text-secondary bg-surface-container px-2 py-1 rounded-sm'
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

  const handleChatClick = (requestId: string) => {
    router.push(`/garage-dashboard/${garageId}/chat/${requestId}`)
  }

  if (isLoading) {
    return (
      <div className={styles.pageCenter}>
        <div className="text-center">
          <div className={styles.loadingSpinner}></div>
          <p className={styles.bodyText}>Φόρτωση συνομιλιών...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.pageWrapper}>
      {/* Header */}
      <div className="bg-surface-container-lowest border-b border-outline-variant/10 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-5 md:px-8">
          <div className="flex items-center gap-4 py-4">
            <button
              onClick={() => router.push(`/garage-dashboard/${garageId}`)}
              className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center hover:bg-surface-container-highest transition-colors"
            >
              <Icon name="arrow_back" size="sm" className="text-on-surface" />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-on-surface">Ανοιχτές Συνομιλίες</h1>
              <p className="text-xs text-secondary">
                Συνομιλίες με πελάτες για ανοιχτά αιτήματα
              </p>
            </div>
            <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center">
              <span className="text-xs font-bold text-on-surface">{chatRequests.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-5 md:px-8 py-5">
        {chatRequests.length > 0 ? (
          <div className="space-y-3">
            {chatRequests.map((request) => (
              <div
                key={request.id}
                onClick={() => handleChatClick(request.id)}
                className={`${styles.card} cursor-pointer hover:shadow-lg hover:border-primary/20 active:scale-[0.99] transition-all duration-200`}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="w-11 h-11 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0">
                    <Icon name="directions_car" size="sm" className="text-primary" filled />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Top row: Vehicle + Time */}
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0">
                        {request.vehicle && (
                          <h3 className="text-sm font-bold text-on-surface truncate">
                            {request.vehicle.brand} {request.vehicle.model} {request.vehicle.modelYear && `(${request.vehicle.modelYear})`}
                          </h3>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {request.lastMessage && (
                          <span className="text-[10px] text-secondary">
                            {formatLastMessageTime(request.lastMessage.timestamp)}
                          </span>
                        )}
                        {request.unreadCount && request.unreadCount > 0 && (
                          <span className="bg-primary text-on-primary text-[10px] font-bold h-5 w-5 rounded-full flex items-center justify-center">
                            {request.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Category + Status */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-secondary">{getCategoryText(request.category)}</span>
                      <span className="text-outline">--</span>
                      <span className={getStatusStyle(request.status)}>
                        {getStatusText(request.status)}
                      </span>
                    </div>

                    {/* Last message preview */}
                    {request.lastMessage ? (
                      <p className="text-xs text-secondary line-clamp-1">
                        <span className="font-bold text-on-surface-variant">
                          {request.lastMessage.sender === 'garage' ? 'Εσείς: ' : ''}
                        </span>
                        {request.lastMessage.content}
                      </p>
                    ) : (
                      <p className="text-xs text-secondary italic">Δεν υπάρχουν μηνύματα</p>
                    )}
                  </div>

                  {/* Arrow */}
                  <Icon name="chevron_right" size="sm" className="text-outline flex-shrink-0 mt-3" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-20 h-20 rounded-full bg-surface-container flex items-center justify-center mx-auto mb-5">
              <Icon name="forum" size="xl" className="text-secondary" />
            </div>
            <h3 className="text-lg font-bold text-on-surface mb-2">Δεν υπάρχουν ανοιχτές συνομιλίες</h3>
            <p className="text-sm text-secondary mb-6 max-w-xs mx-auto">
              Δεν έχετε ακόμα συνομιλίες με πελάτες για ανοιχτά αιτήματα.
            </p>
            <button
              onClick={() => router.push(`/garage-dashboard/${garageId}?tab=requests`)}
              className={styles.btnPrimary + ' mx-auto'}
            >
              <Icon name="search" size="sm" />
              Δείτε Νέα Αιτήματα
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
