'use client'

import { useState, useEffect } from 'react'
import { Card, Badge, Button } from '@/components'
import { styles } from '@/styles/styles'

interface ServiceRequest {
  id: string
  description: string
  category: string
  urgency: string
  status: string
  createdAt: string
  client: {
    firstName: string
    lastName: string
    phoneNumber: string
  }
  vehicle: {
    brand: string
    model: string
    year: number
    licensePlate: string
  }
  photoUrls?: string[]
}

interface AvailableRequestsProps {
  garageId: string
}

export default function AvailableRequests({ garageId }: AvailableRequestsProps) {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null)
  const [showOfferModal, setShowOfferModal] = useState(false)

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

  // Get unique categories from requests
  const getUniqueCategories = () => {
    const categories = requests.map(request => request.category)
    return Array.from(new Set(categories))
  }

  const handleMakeOffer = (request: ServiceRequest) => {
    setSelectedRequest(request)
    setShowOfferModal(true)
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
            <Card key={request.id} className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className={`${styles.sectionTitle} text-lg`}>
                      {request.vehicle.brand} {request.vehicle.model} ({request.vehicle.year})
                    </h3>
                    <Badge variant="secondary">
                      {getCategoryText(request.category)}
                    </Badge>
                  </div>
                  <p className={`${styles.bodyText} mb-2`}>
                    <strong>Πελάτης:</strong> {request.client.firstName} {request.client.lastName}
                  </p>
                  <p className={`${styles.bodyText} mb-2`}>
                    <strong>Τηλέφωνο:</strong> {request.client.phoneNumber}
                  </p>
                  <p className={`${styles.bodyText} mb-2`}>
                    <strong>Πινακίδα:</strong> {request.vehicle.licensePlate}
                  </p>
                  <p className={`${styles.bodyText} mb-2`}>
                    <strong>Αίτημα:</strong> {request.description}
                  </p>
                  {request.photoUrls && request.photoUrls.length > 0 && (
                    <p className={`${styles.bodyText} mb-2`}>
                      <strong>Φωτογραφίες:</strong> {request.photoUrls.length} φωτογραφία(ες)
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className={`${styles.smallText} text-gray-500 mb-4`}>
                    {new Date(request.createdAt).toLocaleDateString('el-GR')}
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleMakeOffer(request)}
                  >
                    Κάνε Προσφορά
                  </Button>
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
