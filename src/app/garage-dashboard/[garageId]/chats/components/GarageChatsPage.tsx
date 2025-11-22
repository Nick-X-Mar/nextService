'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { HiArrowLeft, HiChatBubbleLeftRight, HiClock, HiCalendar, HiEye } from 'react-icons/hi2'
import { styles } from '../../../../../styles/styles'
import { useToast } from '../../../../../hooks/useToast'
import GarageNavigation from '../../../../../components/GarageNavigation'
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
      const requestIds = [...new Set(offersData.offers.map((offer: any) => offer.serviceRequestId))]
      
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

      setChatRequests(requestsWithMessages)
    } catch (error) {
      console.error('Error loading chat requests:', error)
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
      case ServiceRequestStatus.PENDING:
        return <HiClock className="h-5 w-5 text-yellow-600" />
      case ServiceRequestStatus.IN_PROGRESS:
        return <HiClock className="h-5 w-5 text-blue-600" />
      default:
        return <HiClock className="h-5 w-5 text-gray-600" />
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

  const getStatusColor = (status: ServiceRequestStatus) => {
    switch (status) {
      case ServiceRequestStatus.PENDING:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case ServiceRequestStatus.IN_PROGRESS:
        return 'bg-blue-100 text-blue-800 border-blue-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
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
            <span className={styles.titleHighlight}>Ανοιχτές Συνομιλίες</span>
          </h1>
          <p className={`mt-3 max-w-md mx-auto ${styles.bodyText} sm:text-lg md:mt-5 md:text-xl md:max-w-3xl`}>
            Συνομιλίες με πελάτες για αιτήματα που είναι ακόμα ανοιχτά
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
                      {/* Header with status and unread count */}
                      <div className="flex items-center gap-3 mb-3">
                        <HiChatBubbleLeftRight className="h-5 w-5 text-orange-600" />
                        <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(request.status)}`}>
                          {getStatusText(request.status)}
                        </span>
                        {request.unreadCount && request.unreadCount > 0 && (
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                            {request.unreadCount} νέα
                          </span>
                        )}
                      </div>

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
                            <span>{formatDate(request.createdAt)}</span>
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
                <HiChatBubbleLeftRight className="h-12 w-12 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Δεν υπάρχουν ανοιχτές συνομιλίες</h3>
              <p className="text-gray-500 mb-6">
                Δεν έχετε ακόμα συνομιλίες με πελάτες για ανοιχτά αιτήματα.
              </p>
              <button
                onClick={() => router.push(`/garage-dashboard/${garageId}?tab=requests`)}
                className={styles.btnPrimary}
              >
                Δείτε Νέα Αιτήματα
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

