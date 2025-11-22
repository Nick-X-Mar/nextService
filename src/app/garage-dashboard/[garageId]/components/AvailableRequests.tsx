'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, Badge, Button } from '@/components'
import { styles } from '@/styles/styles'
import { ServiceRequestStatus } from '@/types/statuses'
import type { ServiceRequest } from '@/types/requests'

interface AvailableRequestsProps {
  garageId: string
}

export default function AvailableRequests({ garageId }: AvailableRequestsProps) {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null)
  const [showOfferModal, setShowOfferModal] = useState(false)
  const router = useRouter()

  useEffect(() => {
    loadAvailableRequests()
  }, [garageId])

  const loadAvailableRequests = async () => {
    try {
      setIsLoading(true)
      
      const response = await fetch(`/api/garage/available-requests?garageId=${garageId}`)
      const data = await response.json()

      if (response.ok && data.success) {
        setRequests(data.requests)
      } else {
        console.error('Error loading requests:', data.error)
        setRequests([])
      }
    } catch (error) {
      console.error('Error loading requests:', error)
      setRequests([])
    } finally {
      setIsLoading(false)
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

  const getFuelTypeText = (fuelType: string | undefined) => {
    if (!fuelType) return '-'
    switch (fuelType.toLowerCase()) {
      case 'petrol':
        return 'Βενζίνη'
      case 'diesel':
        return 'Πετρέλαιο'
      case 'electric':
        return 'Ηλεκτρικό'
      case 'hybrid':
        return 'Υβριδικό'
      case 'lpg':
        return 'Υγραέριο'
      default:
        return fuelType
    }
  }

  // Get unique categories from requests
  const getUniqueCategories = () => {
    const categories = requests.map(request => request.category)
    return Array.from(new Set(categories))
  }

  const handleMakeOffer = (request: ServiceRequest) => {
    router.push(`/garage-dashboard/${garageId}/offers/${request.id}`)
  }

  const handleOpenChat = (request: ServiceRequest) => {
    router.push(`/garage-dashboard/${garageId}/chat/${request.id}`)
  }

  const handleCardClick = (request: ServiceRequest) => {
    router.push(`/garage-dashboard/${garageId}/offers/${request.id}`)
  }

  const filteredRequests = requests.filter(request => {
    if (filter === 'all') return true
    return request.category === filter
  })

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-4"></div>
        <p className={styles.bodyText}>Φόρτωση αιτημάτων...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className={`${styles.sectionTitle} mb-2`}>
            Διαθέσιμα Αιτήματα
          </h2>
          <p className={styles.bodyText}>
            Αιτήματα υπηρεσιών που μπορείτε να κάνετε προσφορά
          </p>
        </div>
        <div className="text-sm text-gray-500">
          Σύνολο: {requests.length} αιτήματα
        </div>
      </div>

      {/* Filter */}
      <div className="flex space-x-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === 'all'
              ? 'bg-orange-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Όλα
        </button>
        {getUniqueCategories().map((category) => (
          <button
            key={category}
            onClick={() => setFilter(category)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === category
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {getCategoryText(category)}
          </button>
        ))}
      </div>

      {/* Requests List */}
      {filteredRequests.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="text-gray-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3 className={`${styles.sectionTitle} mb-2`}>
            Δεν υπάρχουν διαθέσιμα αιτήματα
          </h3>
          <p className={styles.bodyText}>
            {filter === 'all' 
              ? 'Δεν υπάρχουν αιτήματα υπηρεσιών διαθέσιμα αυτή τη στιγμή.'
              : `Δεν υπάρχουν αιτήματα στην κατηγορία "${getCategoryText(filter)}".`
            }
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredRequests.map((request) => (
            <Card key={request.id} className="p-6 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => handleCardClick(request)}>
              <div className="flex justify-between items-start gap-6">
                <div className="flex-1">
                  {/* Header with Vehicle Info and Category */}
                  <div className="flex items-center space-x-3 mb-4">
                    <h3 className={`${styles.sectionTitle} text-lg`}>
                      {request.vehicle.brand} {request.vehicle.model}
                    </h3>
                    <Badge variant="secondary">
                      {getCategoryText(request.category)}
                    </Badge>
                    {/* Photo Indicator - only show when photos exist */}
                    {request.photoUrls && request.photoUrls.length > 0 && (
                      <div className="flex items-center gap-1 text-green-600">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm font-medium">Φωτογραφίες</span>
                      </div>
                    )}
                  </div>

                  {/* Vehicle Details Grid */}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-4">
                    <div>
                      <p className={`${styles.bodyText} text-sm`}>
                        <span className="text-gray-600">Έτος Μοντέλου:</span> <strong>{request.vehicle.modelYear || request.vehicle.year}</strong>
                      </p>
                    </div>
                    <div>
                      <p className={`${styles.bodyText} text-sm`}>
                        <span className="text-gray-600">Καύσιμο:</span> <strong>{getFuelTypeText(request.vehicle.fuelType)}</strong>
                      </p>
                    </div>
                    <div>
                      <p className={`${styles.bodyText} text-sm`}>
                        <span className="text-gray-600">Κυβικά:</span> <strong>{request.vehicle.engineCC ? `${request.vehicle.engineCC} cc` : '-'}</strong>
                      </p>
                    </div>
                    <div>
                      <p className={`${styles.bodyText} text-sm`}>
                        <span className="text-gray-600">Κιβώτιο:</span> <strong>{request.vehicle.isAutomatic ? 'Αυτόματο' : 'Χειροκίνητο'}</strong>
                      </p>
                    </div>
                    <div>
                      <p className={`${styles.bodyText} text-sm`}>
                        <span className="text-gray-600">4x4:</span> <strong>{request.vehicle.is4x4 ? 'Ναι' : 'Όχι'}</strong>
                      </p>
                    </div>
                    <div>
                      <p className={`${styles.bodyText} text-sm`}>
                        <span className="text-gray-600">Turbo:</span> <strong>{request.vehicle.isTurbo ? 'Ναι' : 'Όχι'}</strong>
                      </p>
                    </div>
                    {request.vehicle.vinNumber && (
                      <div className="col-span-2">
                        <p className={`${styles.bodyText} text-sm`}>
                          <span className="text-gray-600">VIN:</span> <strong>{request.vehicle.vinNumber}</strong>
                        </p>
                      </div>
                    )}
                    {request.vehicle.engineNumber && (
                      <div className="col-span-2">
                        <p className={`${styles.bodyText} text-sm`}>
                          <span className="text-gray-600">Αρ. Κινητήρα:</span> <strong>{request.vehicle.engineNumber}</strong>
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Client Info */}
                  <div className="border-t pt-3 mb-3">
                    <p className={`${styles.bodyText} text-sm mb-1`}>
                      <span className="text-gray-600">Πελάτης:</span> <strong>{request.client.firstName} {request.client.lastName}</strong>
                    </p>
                    <p className={`${styles.bodyText} text-sm`}>
                      <span className="text-gray-600">Τηλέφωνο:</span> <strong>{request.client.phoneNumber}</strong>
                    </p>
                  </div>

                  {/* Description */}
                  <div className="border-t pt-3">
                    <p className={`${styles.bodyText} text-sm`}>
                      <span className="text-gray-600">Περιγραφή:</span>
                    </p>
                    <p className={`${styles.bodyText} mt-1`}>
                      {request.description}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="text-right flex-shrink-0">
                  <p className={`${styles.smallText} text-gray-500 mb-4`}>
                    {new Date(request.createdAt).toLocaleDateString('el-GR')}
                  </p>
                  <div className="flex flex-col space-y-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleMakeOffer(request)
                      }}
                    >
                      Κάνε Προσφορά
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleOpenChat(request)
                      }}
                    >
                      Συνομιλία
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Offer Modal - TODO: Implement this */}
      {showOfferModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className={`${styles.sectionTitle} mb-4`}>
              Κάνε Προσφορά
            </h3>
            <p className={styles.bodyText}>
              Προσφορά για: {selectedRequest.vehicle.brand} {selectedRequest.vehicle.model}
            </p>
            <div className="mt-6 flex space-x-3">
              <Button
                variant="primary"
                onClick={() => {
                  // TODO: Implement offer submission
                  setShowOfferModal(false)
                  setSelectedRequest(null)
                }}
              >
                Υποβολή Προσφοράς
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowOfferModal(false)
                  setSelectedRequest(null)
                }}
              >
                Ακύρωση
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
