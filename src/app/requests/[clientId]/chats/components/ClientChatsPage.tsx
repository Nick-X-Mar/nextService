'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { HiArrowLeft, HiChatBubbleLeftRight, HiClock, HiCalendar, HiUser, HiEye } from 'react-icons/hi2'
import { styles } from '../../../../../styles/styles'
import { useToast } from '../../../../../hooks/useToast'
import ClientNavigation from '../../../../../components/ClientNavigation'

interface ChatRequest {
  id: string
  clientId: string
  vehicleId: string
  category: string
  description: string
  status: 'appointment' | 'pending' | 'in-progress' | 'completed' | 'cancelled'
  urgency: 'low' | 'normal' | 'high'
  estimatedCost?: number
  photoUrls: string[]
  photos: Array<{
    id: string
    s3Url: string
    s3Key: string
    originalName: string
    fileSize: number
    contentType: string
    description?: string
    uploadedAt: string
  }>
  createdAt: string
  updatedAt: string
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

interface ClientChatsPageProps {
  clientId: string
}

export default function ClientChatsPage({ clientId }: ClientChatsPageProps) {
  const router = useRouter()
  const { error } = useToast()
  const [chatRequests, setChatRequests] = useState<ChatRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadChatRequests = async () => {
    try {
      // First, get all requests for this client
      const response = await fetch(`/api/requests?clientId=${clientId}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch requests')
      }

      const result = await response.json()
      
      if (result.success) {
        // Filter requests that have chat activity (for now, show all requests with offers or in-progress status)
        const requestsWithChats = result.requests.filter((request: ChatRequest) => 
          request.status === 'in-progress' || 
          request.status === 'appointment' || 
          request.status === 'pending'
        )

        // For each request, try to get the last message
        const requestsWithMessages = await Promise.all(
          requestsWithChats.map(async (request: ChatRequest) => {
            try {
              const chatResponse = await fetch(`/api/chat/${request.id}/messages`)
              if (chatResponse.ok) {
                const chatData = await chatResponse.json()
                if (chatData.messages && chatData.messages.length > 0) {
                  const lastMessage = chatData.messages[chatData.messages.length - 1]
                  return {
                    ...request,
                    lastMessage: {
                      content: lastMessage.content,
                      timestamp: lastMessage.timestamp,
                      sender: lastMessage.sender
                    },
                    unreadCount: chatData.messages.filter((msg: any) => 
                      msg.sender === 'garage' && !msg.read
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
      } else {
        console.error('API error:', result.error)
        setChatRequests([])
      }
    } catch (error) {
      console.error('Error loading chat requests:', error)
      setChatRequests([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadChatRequests()
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'appointment':
        return <HiCalendar className="h-5 w-5 text-blue-600" />
      case 'pending':
        return <HiClock className="h-5 w-5 text-yellow-600" />
      case 'in-progress':
        return <HiClock className="h-5 w-5 text-blue-600" />
      case 'completed':
        return <HiClock className="h-5 w-5 text-green-600" />
      case 'cancelled':
        return <HiClock className="h-5 w-5 text-red-600" />
      default:
        return <HiClock className="h-5 w-5 text-gray-600" />
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'appointment':
        return 'Ραντεβού'
      case 'pending':
        return 'Εκκρεμές'
      case 'in-progress':
        return 'Σε Εξέλιξη'
      case 'completed':
        return 'Ολοκληρωμένο'
      case 'cancelled':
        return 'Ακυρωμένο'
      default:
        return 'Άγνωστο'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'appointment':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'in-progress':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'cancelled':
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

  const handleChatClick = (requestId: string) => {
    // Navigate to the individual chat page for this request
    router.push(`/requests/${clientId}/chats/${requestId}`)
  }

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
                            {request.vehicle.brand} {request.vehicle.model} ({request.vehicle.modelYear})
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
                              {request.lastMessage.sender === 'client' ? 'Εσείς' : 'Συνεργείο'}
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
              <h3 className="text-lg font-medium text-gray-900 mb-2">Δεν υπάρχουν συνομιλίες</h3>
              <p className="text-gray-500 mb-6">
                Δεν έχετε ακόμα συνομιλίες με συνεργεία. Όταν ένα συνεργείο απαντήσει στο αίτημά σας, 
                θα εμφανιστεί εδώ.
              </p>
              <button
                onClick={() => router.push(`/requests/${clientId}`)}
                className={styles.btnPrimary}
              >
                Δείτε τα Αιτήματά σας
              </button>
            </div>
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
