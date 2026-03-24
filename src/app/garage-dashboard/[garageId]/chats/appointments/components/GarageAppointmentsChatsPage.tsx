'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { HiArrowLeft, HiChatBubbleLeftRight, HiCalendar, HiEye } from 'react-icons/hi2'
import { styles } from '../../../../../../styles/styles'
import { useToast } from '../../../../../../hooks/useToast'
import GarageNavigation from '../../../../../../components/GarageNavigation'
import { ServiceRequestStatus } from '../../../../../../types/statuses'
import type { ServiceRequest } from '../../../../../../types/requests'

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
  const [garageData, setGarageData] = useState<any>(null)

  useEffect(() => {
    loadGarageData()
    loadAppointmentChats()
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

  const loadAppointmentChats = async () => {
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

      // Filter for accepted offers with appointment dates
      const acceptedOffers = offersData.offers.filter((offer: any) => 
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
      const upcomingOffers = acceptedOffers.filter((offer: any) => {
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
      const requestIds = [...new Set(upcomingOffers.map((offer: any) => offer.serviceRequestId))]
      
      // For each request, get the full request data
      const requestsWithDetails = await Promise.all(
        requestIds.map(async (requestId: string) => {
          try {
            const requestResponse = await fetch(`/api/requests/${requestId}`)
            if (requestResponse.ok) {
              const requestData = await requestResponse.json()
              if (requestData.success && requestData.request) {
                // Find the corresponding offer to get appointmentDate
                const offer = upcomingOffers.find((o: any) => o.serviceRequestId === requestId)
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
      const appointmentRequests = requestsWithDetails.filter((request: any) => 
        request && 
        request.status === ServiceRequestStatus.APPOINTMENT
      )

      // For each request, get the last message
      const requestsWithMessages = await Promise.all(
        appointmentRequests.map(async (request: ChatRequest) => {
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
                    sender: lastMessage.senderType === 'garage' ? 'garage' : 'client'
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

      // Sort by appointment date (earliest first)
      requestsWithMessages.sort((a, b) => {
        if (!a.appointmentDate || !b.appointmentDate) return 0
        const dateA = new Date(`${a.appointmentDate}T00:00:00`).getTime()
        const dateB = new Date(`${b.appointmentDate}T00:00:00`).getTime()
        return dateA - dateB
      })

      setChatRequests(requestsWithMessages)
    } catch (error) {
      console.error('Error loading appointment chats:', error)
      setChatRequests([])
      error('Σφάλμα', 'Δεν ήταν δυνατή η φόρτωση των συνομιλιών')
    } finally {
      setIsLoading(false)
    }
  }

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
      <section className="bg-white min-h-screen">
        <GarageNavigation garageId={garageId} companyName={garageData?.companyName} />
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
      <GarageNavigation garageId={garageId} companyName={garageData?.companyName} />
      <div className={`${styles.container} py-24`}>
        <div className="text-center mb-8">
          <h1 className={styles.pageTitle}>
            <span className={styles.titleHighlight}>Συνομιλίες με Επερχόμενα Ραντεβού</span>
          </h1>
          <p className={`mt-3 max-w-md mx-auto ${styles.bodyText} sm:text-lg md:mt-5 md:text-xl md:max-w-3xl`}>
            Συνομιλίες με πελάτες που έχουν προγραμματιστεί ραντεβού από σήμερα και μετά
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          {chatRequests.length > 0 ? (
            <div className="space-y-4">
              {chatRequests.map((request) => (
                <div 
                  key={request.id}
                  className={`${styles.card} hover:shadow-lg hover:border-orange-300 transition-all duration-200 cursor-pointer`}
                  onClick={() => handleChatClick(request.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {/* Header with appointment badge */}
                      <div className="flex items-center gap-3 mb-3">
                        <HiChatBubbleLeftRight className="h-5 w-5 text-orange-600" />
                        <span className="px-2 py-1 text-xs font-medium rounded-full border bg-blue-100 text-blue-800 border-blue-200">
                          <HiCalendar className="h-4 w-4 inline mr-1" />
                          Ραντεβού
                        </span>
                        {request.unreadCount && request.unreadCount > 0 && (
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                            {request.unreadCount} νέα
                          </span>
                        )}
                      </div>

                      {/* Appointment Date - Prominent */}
                      {request.appointmentDate && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                          <div className="flex items-center gap-2">
                            <HiCalendar className="h-5 w-5 text-blue-600" />
                            <div>
                              <p className="text-sm font-medium text-blue-900">
                                Ημερομηνία Ραντεβού
                              </p>
                              <p className="text-lg font-bold text-blue-700">
                                {formatAppointmentDate(request.appointmentDate)}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Vehicle info */}
                      {request.vehicle && (
                        <div className="mb-3">
                          <h3 className="font-semibold text-gray-900">
                            {request.vehicle.brand} {request.vehicle.model} {request.vehicle.modelYear && `(${request.vehicle.modelYear})`}
                          </h3>
                          <p className="text-sm text-gray-600">
                            Κατηγορία: {getCategoryText(request.category)}
                          </p>
                        </div>
                      )}

                      {/* Description */}
                      <p className="text-gray-700 mb-3 line-clamp-2">
                        {request.description}
                      </p>

                      {/* Last message or request details */}
                      {request.lastMessage ? (
                        <div className="bg-gray-50 rounded-lg p-3 mb-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-gray-500">
                              {request.lastMessage.sender === 'garage' ? 'Εσείς' : 'Πελάτης'}
                            </span>
                            <span className="text-xs text-gray-400">
                              {formatLastMessageTime(request.lastMessage.timestamp)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 line-clamp-2">
                            {request.lastMessage.content}
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
                          <div className="flex items-center gap-1">
                            <HiCalendar className="h-4 w-4" />
                            <span>Δημιουργήθηκε: {formatDate(request.createdAt)}</span>
                          </div>
                          {request.estimatedCost && (
                            <div className="flex items-center gap-1">
                              <span className="font-medium text-green-600">
                                €{request.estimatedCost}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Chat Button */}
                    <div className="ml-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleChatClick(request.id)
                        }}
                        className={`${styles.btnPrimary} flex items-center gap-2 px-4 py-2 text-sm`}
                      >
                        <HiEye className="h-4 w-4" />
                        Άνοιγμα Συνομιλίας
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <HiCalendar className="h-12 w-12 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Δεν υπάρχουν επερχόμενα ραντεβού</h3>
              <p className="text-gray-500 mb-6">
                Δεν έχετε προγραμματισμένα ραντεβού από σήμερα και μετά.
              </p>
              <button
                onClick={() => router.push(`/garage-dashboard/${garageId}?tab=appointments`)}
                className={styles.btnPrimary}
              >
                Δείτε τα Ραντεβού
              </button>
            </div>
          )}

          {/* Back Button */}
          <div className="mt-8 text-center">
            <button
              onClick={() => router.push(`/garage-dashboard/${garageId}`)}
              className={`inline-flex items-center gap-2 ${styles.linkText} font-medium transition-colors duration-200`}
            >
              <HiArrowLeft className="h-4 w-4" />
              Επιστροφή στον Πίνακα Ελέγχου
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}








