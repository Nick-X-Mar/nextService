'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/ui/Icon'
import RequestDetailsContent from '../../../components/RequestDetailsContent'
import { ServiceRequestStatus } from '../../../../../types/statuses'
import type { ServiceRequest } from '../../../../../types/requests'

interface RequestDetailsPageProps {
  clientId: string
  requestId: string
}

export default function RequestDetailsPage({ clientId, requestId }: RequestDetailsPageProps) {
  const router = useRouter()
  const [request, setRequest] = useState<ServiceRequest | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadRequest = useCallback(async () => {
    try {
      const response = await fetch(`/api/requests?clientId=${clientId}`)
      if (!response.ok) throw new Error('Failed to fetch requests')

      const result = await response.json()
      if (result.success) {
        const found = result.requests.find((r: ServiceRequest) => r.id === requestId)
        if (found) {
          setRequest(found)
        } else {
          setError('Το αίτημα δεν βρέθηκε.')
        }
      } else {
        setError('Σφάλμα κατά τη φόρτωση του αιτήματος.')
      }
    } catch {
      setError('Σφάλμα κατά τη φόρτωση του αιτήματος.')
    } finally {
      setIsLoading(false)
    }
  }, [clientId, requestId])

  useEffect(() => {
    loadRequest()
  }, [loadRequest])

  const handleRequestUpdate = (updatedRequest: ServiceRequest) => {
    setRequest(updatedRequest)
  }

  const getStatusIcon = (status: ServiceRequestStatus) => {
    switch (status) {
      case ServiceRequestStatus.APPOINTMENT:
        return <Icon name="event" filled className="text-blue-600" size="md" />
      case ServiceRequestStatus.PENDING:
        return <Icon name="schedule" filled className="text-yellow-600" size="md" />
      case ServiceRequestStatus.IN_PROGRESS:
        return <Icon name="pending" filled className="text-blue-600" size="md" />
      case ServiceRequestStatus.COMPLETED:
        return <Icon name="check_circle" filled className="text-green-600" size="md" />
      case ServiceRequestStatus.CANCELLED:
        return <Icon name="cancel" filled className="text-red-600" size="md" />
      default:
        return <Icon name="schedule" className="text-secondary" size="md" />
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
        return 'bg-blue-100 text-blue-800'
      case ServiceRequestStatus.PENDING:
        return 'bg-primary/10 text-primary'
      case ServiceRequestStatus.IN_PROGRESS:
        return 'bg-blue-100 text-blue-800'
      case ServiceRequestStatus.COMPLETED:
        return 'bg-green-100 text-green-800'
      case ServiceRequestStatus.CANCELLED:
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-surface-container text-on-surface-variant'
    }
  }

  if (isLoading) {
    return (
      <section className="bg-surface min-h-screen">
        <div className="px-5 max-w-4xl mx-auto pt-6 pb-4">
          <div className="text-center py-16">
            <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-on-surface-variant">Φόρτωση αιτήματος...</p>
          </div>
        </div>
      </section>
    )
  }

  if (error || !request) {
    return (
      <section className="bg-surface min-h-screen">
        <div className="px-5 max-w-4xl mx-auto pt-6 pb-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors mb-6"
          >
            <Icon name="arrow_back" size="sm" />
            Πίσω
          </button>
          <div className="text-center py-16">
            <div className="mx-auto w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
              <Icon name="error" filled className="text-red-500" size="lg" />
            </div>
            <p className="text-sm text-on-surface-variant">{error || 'Το αίτημα δεν βρέθηκε.'}</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="bg-surface min-h-screen">
      <div className="px-5 max-w-4xl mx-auto pt-6 pb-8">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors mb-6"
        >
          <Icon name="arrow_back" size="sm" />
          Πίσω στα αιτήματα
        </button>

        {/* Page title */}
        <h2 className="text-2xl font-bold tracking-tight mb-6">Λεπτομέρειες Αιτήματος</h2>

        {/* Reuse the existing details content */}
        <RequestDetailsContent
          request={request}
          onRequestUpdate={handleRequestUpdate}
          getStatusIcon={getStatusIcon}
          getStatusText={getStatusText}
          getStatusColor={getStatusColor}
        />
      </div>
    </section>
  )
}
