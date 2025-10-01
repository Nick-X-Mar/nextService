'use client'

import { useState, useEffect } from 'react'
import { Card, Badge } from '@/components'
import { styles } from '@/styles/styles'

interface Offer {
  id: string
  serviceRequestId: string
  price: number
  currency: string
  description: string
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  createdAt: string
  serviceRequest: {
    id: string
    description: string
    category: string
    urgency: string
    client: {
      firstName: string
      lastName: string
    }
    vehicle: {
      brand: string
      model: string
      year: number
    }
  }
}

interface MyOffersProps {
  garageId: string
}

export default function MyOffers({ garageId }: MyOffersProps) {
  const [offers, setOffers] = useState<Offer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all')

  useEffect(() => {
    loadOffers()
  }, [garageId])

  const loadOffers = async () => {
    try {
      setIsLoading(true)
      
      const response = await fetch(`/api/garage/offers?garageId=${garageId}`)
      const data = await response.json()

      if (response.ok && data.success) {
        setOffers(data.offers)
      } else {
        console.error('Error loading offers:', data.error)
        setOffers([])
      }
    } catch (error) {
      console.error('Error loading offers:', error)
      setOffers([])
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'pending':
        return 'warning'
      case 'accepted':
        return 'success'
      case 'rejected':
        return 'danger'
      case 'expired':
        return 'secondary'
      default:
        return 'secondary'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Εκκρεμής'
      case 'accepted':
        return 'Αποδεκτή'
      case 'rejected':
        return 'Απορριφθείσα'
      case 'expired':
        return 'Λήξασα'
      default:
        return status
    }
  }

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'high':
        return 'text-red-600'
      case 'normal':
        return 'text-yellow-600'
      case 'low':
        return 'text-green-600'
      default:
        return 'text-gray-600'
    }
  }

  const getUrgencyText = (urgency: string) => {
    switch (urgency) {
      case 'high':
        return 'Υψηλή'
      case 'normal':
        return 'Κανονική'
      case 'low':
        return 'Χαμηλή'
      default:
        return urgency
    }
  }

  const filteredOffers = offers.filter(offer => {
    if (filter === 'all') return true
    return offer.status === filter
  })

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-4"></div>
        <p className={styles.bodyText}>Φόρτωση προσφορών...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className={`${styles.sectionTitle} mb-2`}>
            Οι Προσφορές μου
          </h2>
          <p className={styles.bodyText}>
            Δείτε όλες τις προσφορές που έχετε κάνει για αιτήματα υπηρεσιών
          </p>
        </div>
        <div className="text-sm text-gray-500">
          Σύνολο: {offers.length} προσφορές
        </div>
      </div>

      {/* Filter */}
      <div className="flex space-x-2">
        {(['all', 'pending', 'accepted', 'rejected'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === status
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {status === 'all' ? 'Όλες' : getStatusText(status)}
          </button>
        ))}
      </div>

      {/* Offers List */}
      {filteredOffers.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="text-gray-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className={`${styles.sectionTitle} mb-2`}>
            Δεν υπάρχουν προσφορές
          </h3>
          <p className={styles.bodyText}>
            {filter === 'all' 
              ? 'Δεν έχετε κάνει ακόμα καμία προσφορά. Ξεκινήστε να κάνετε προσφορές σε διαθέσιμα αιτήματα για να δείτε τις προσφορές σας εδώ.'
              : `Δεν υπάρχουν προσφορές με κατάσταση "${getStatusText(filter)}".`
            }
          </p>
          {filter === 'all' && (
            <div className="mt-4">
              <button
                onClick={() => {
                  // This would switch to the available requests tab
                  // We'll need to pass a callback from the parent component
                  window.location.hash = 'available'
                }}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-orange-500 hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-colors"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Δείτε Διαθέσιμα Αιτήματα
              </button>
            </div>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredOffers.map((offer) => (
            <Card key={offer.id} className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className={`${styles.sectionTitle} text-lg`}>
                      {offer.serviceRequest.vehicle.brand} {offer.serviceRequest.vehicle.model} ({offer.serviceRequest.vehicle.year})
                    </h3>
                    <Badge variant={getStatusBadgeVariant(offer.status)}>
                      {getStatusText(offer.status)}
                    </Badge>
                  </div>
                  <p className={`${styles.bodyText} mb-2`}>
                    <strong>Πελάτης:</strong> {offer.serviceRequest.client.firstName} {offer.serviceRequest.client.lastName}
                  </p>
                  <p className={`${styles.bodyText} mb-2`}>
                    <strong>Αίτημα:</strong> {offer.serviceRequest.description}
                  </p>
                  <p className={`${styles.bodyText} mb-2`}>
                    <strong>Κατηγορία:</strong> {offer.serviceRequest.category}
                  </p>
                  <p className={`${styles.bodyText} mb-2`}>
                    <strong>Επείγον:</strong> 
                    <span className={`ml-1 ${getUrgencyColor(offer.serviceRequest.urgency)}`}>
                      {getUrgencyText(offer.serviceRequest.urgency)}
                    </span>
                  </p>
                </div>
                <div className="text-right">
                  <div className={`${styles.sectionTitle} text-2xl text-orange-600`}>
                    {offer.price} {offer.currency}
                  </div>
                  <p className={`${styles.smallText} text-gray-500`}>
                    {new Date(offer.createdAt).toLocaleDateString('el-GR')}
                  </p>
                </div>
              </div>
              
              <div className="border-t pt-4">
                <h4 className={`${styles.label} mb-2`}>Περιγραφή Προσφοράς:</h4>
                <p className={styles.bodyText}>
                  {offer.description}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
