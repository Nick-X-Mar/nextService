'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { styles } from '@/styles/styles'
import { useToast } from '@/hooks/useToast'
import { ServiceRequestStatus } from '@/types/statuses'
import type { ServiceRequest } from '@/types/requests'
import Icon from '@/components/ui/Icon'
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
  appointmentDate?: string
}

interface GarageAppointmentsChatsPageProps {
  garageId: string
}

export default function GarageAppointmentsChatsPage({ garageId }: GarageAppointmentsChatsPageProps) {
  const router = useRouter()
  const { error } = useToast()
  const [chatRequests, setChatRequests] = useState<ChatRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [, setGarageData] = useState<Record<string, unknown> | null>(null)

  const loadGarageData = useCallback(async () => {
    try {
      const response = await fetch(`/api/garage/${garageId}/`)
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setGarageData(data.garage)
        }
      }
    } catch (error) {
      console.error('Error loading garage data:', error)
    }
  }, [garageId])

  const loadAppointmentChats = useCallback(async () => {
    try {
      setIsLoading(true)

      // Get all offers made by this garage
      const offersResponse = await fetch(`/api/garage/offers/?garageId=${garageId}`)
      if (!offersResponse.ok) {
        throw new Error('Failed to fetch offers')
      }

      const offersData = await offersResponse.json()

      if (!offersData.success || !offersData.offers) {
        setChatRequests([])
        setIsLoading(false)
        return
      }

      interface OfferLite { status?: string; appointmentDate?: string; serviceRequestId: string }

      // Filter for accepted offers with appointment dates
      const acceptedOffers: OfferLite[] = offersData.offers.filter((offer: OfferLite) =>
        offer.status === 'accepted' &&
        offer.appointmentDate
      )

      if (acceptedOffers.length === 0) {
        setChatRequests([])
        setIsLoading(false)
        return
      }

      // Get today's date (start of day)
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      // Filter offers with appointment dates >= today
      const upcomingOffers = acceptedOffers.filter((offer) => {
        const appointmentDate = new Date(`${offer.appointmentDate}T00:00:00`)
        appointmentDate.setHours(0, 0, 0, 0)
        return appointmentDate >= today
      })

      if (upcomingOffers.length === 0) {
        setChatRequests([])
        setIsLoading(false)
        return
      }

      // Get unique request IDs from upcoming offers
      const requestIds: string[] = [...new Set<string>(upcomingOffers.map((offer) => offer.serviceRequestId))]

      // For each request, get the full request data
      const requestsWithDetails = await Promise.all(
        requestIds.map(async (requestId: string) => {
          try {
            const requestResponse = await fetch(`/api/requests/${requestId}/`)
            if (requestResponse.ok) {
              const requestData = await requestResponse.json()
              if (requestData.success && requestData.request) {
                // Find the corresponding offer to get appointmentDate
                const offer = upcomingOffers.find((o) => o.serviceRequestId === requestId)
                return {
                  ...requestData.request,
                  appointmentDate: offer?.appointmentDate
                }
              }
            }
          } catch (error) {
            console.error(`Error fetching request ${requestId}:`, error)
          }
          return null
        })
      )

      // Filter requests where status is APPOINTMENT
      const appointmentRequests = requestsWithDetails.filter((request: ChatRequest | null): request is ChatRequest =>
        !!request &&
        request.status === ServiceRequestStatus.APPOINTMENT
      )

      // For each request, get the last message
      const requestsWithMessages = await Promise.all(
        appointmentRequests.map(async (request: ChatRequest) => {
          try {
            const chatResponse = await fetch(`/api/chat/${request.id}/messages/?garageId=${garageId}`)
            if (chatResponse.ok) {
              const chatData = await chatResponse.json()
              if (chatData.messages && chatData.messages.length > 0) {
                const lastMessage = chatData.messages[chatData.messages.length - 1]
                return {
                  ...request,
                  lastMessage: {
                    content: lastMessage.message || lastMessage.content,
                    timestamp: lastMessage.timestamp,
                    sender: (lastMessage.senderType === 'garage' ? 'garage' : 'client') as 'garage' | 'client'
                  },
                  unreadCount: chatData.messages.filter((msg: { senderType?: string; read?: boolean }) =>
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

      // Sort by appointment date (earliest first)
      requestsWithMessages.sort((a, b) => {
        if (!a.appointmentDate || !b.appointmentDate) return 0
        const dateA = new Date(`${a.appointmentDate}T00:00:00`).getTime()
        const dateB = new Date(`${b.appointmentDate}T00:00:00`).getTime()
        return dateA - dateB
      })

      setChatRequests(requestsWithMessages)
    } catch (err) {
      console.error('Error loading appointment chats:', err)
      setChatRequests([])
      error('Σφάλμα', 'Δεν ήταν δυνατή η φόρτωση των συνομιλιών')
    } finally {
      setIsLoading(false)
    }
  }, [garageId, error])

  useEffect(() => {
    loadGarageData()
    loadAppointmentChats()
  }, [garageId, loadGarageData, loadAppointmentChats])

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

  const getDaysUntil = (dateString: string) => {
    const appointment = new Date(`${dateString}T00:00:00`)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const diffDays = Math.ceil((appointment.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return 'Σήμερα'
    if (diffDays === 1) return 'Αύριο'
    return `Σε ${diffDays} ημέρες`
  }

  const handleChatClick = (requestId: string) => {
    router.push(`/garage-dashboard/${garageId}/chat/${requestId}/`)
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
              onClick={() => router.push(`/garage-dashboard/${garageId}/`)}
              className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center hover:bg-surface-container-highest transition-colors"
            >
              <Icon name="arrow_back" size="sm" className="text-on-surface" />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-on-surface">Ραντεβού</h1>
              <p className="text-xs text-secondary">
                Συνομιλίες με επερχόμενα ραντεβού
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
                {/* Appointment date banner */}
                {request.appointmentDate && (
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-outline-variant/10">
                    <div className="w-9 h-9 rounded-lg machined-gradient flex items-center justify-center flex-shrink-0">
                      <Icon name="event" size="sm" className="text-on-primary" filled />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-primary">
                        {getDaysUntil(request.appointmentDate)}
                      </p>
                      <p className="text-sm font-bold text-on-surface">
                        {formatAppointmentDate(request.appointmentDate)}
                      </p>
                    </div>
                    {request.unreadCount != null && request.unreadCount > 0 && (
                      <span className="bg-primary text-on-primary text-[10px] font-bold h-5 w-5 rounded-full flex items-center justify-center">
                        {request.unreadCount}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="w-11 h-11 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0">
                    <Icon name="directions_car" size="sm" className="text-primary" filled />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Vehicle info */}
                    {request.vehicle && (
                      <h3 className="text-sm font-bold text-on-surface truncate mb-0.5">
                        {request.vehicle.brand} {request.vehicle.model} {request.vehicle.modelYear && `(${request.vehicle.modelYear})`}
                      </h3>
                    )}

                    {/* Category */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-secondary">{getCategoryText(request.category)}</span>
                      <span className="text-outline">--</span>
                      <span className={styles.statusAppointment}>Ραντεβού</span>
                    </div>

                    {/* Last message preview */}
                    {request.lastMessage ? (
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-secondary line-clamp-1 flex-1">
                          <span className="font-bold text-on-surface-variant">
                            {request.lastMessage.sender === 'garage' ? 'Εσείς: ' : ''}
                          </span>
                          {request.lastMessage.content}
                        </p>
                        <span className="text-[10px] text-secondary flex-shrink-0">
                          {formatLastMessageTime(request.lastMessage.timestamp)}
                        </span>
                      </div>
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
              <Icon name="event_busy" size="xl" className="text-secondary" />
            </div>
            <h3 className="text-lg font-bold text-on-surface mb-2">Δεν υπάρχουν επερχόμενα ραντεβού</h3>
            <p className="text-sm text-secondary mb-6 max-w-xs mx-auto">
              Δεν έχετε προγραμματισμένα ραντεβού από σήμερα και μετά.
            </p>
            <button
              onClick={() => router.push(`/garage-dashboard/${garageId}/?tab=appointments`)}
              className={styles.btnPrimary + ' mx-auto'}
            >
              <Icon name="calendar_month" size="sm" />
              Δείτε τα Ραντεβού
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
