'use client'

import { useState, useEffect, useCallback } from 'react'
import { useNotifications } from '@/contexts/NotificationsContext'
import { useNavigation } from '@/hooks/useNavigation'
import Spinner from '@/components/Spinner'
import Icon from '@/components/ui/Icon'
import RequestDetailsContent from '../../../components/RequestDetailsContent'
import { ServiceRequestStatus } from '../../../../../types/statuses'
import type { ServiceRequest } from '../../../../../types/requests'

interface RequestDetailsPageProps {
  clientId: string
  requestId: string
}

export default function RequestDetailsPage({ clientId, requestId }: RequestDetailsPageProps) {
  const { refresh: refreshNotifications } = useNotifications()

  // Opening this page is what clears the "νέες προσφορές" alert — the offers
  // are right here, so leaving the banner up would make it wallpaper.
  useEffect(() => {
    if (!requestId) return
    fetch('/api/notifications/seen/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'offers', id: requestId }),
    })
      .then(() => refreshNotifications())
      .catch(() => { /* a stale banner is not worth interrupting the page for */ })
  }, [requestId, refreshNotifications])

  // A real link, not router.back(): opened from an email or a notification there is
  // no history to go back to, and the button did nothing.
  const { navigate, isNavigating } = useNavigation()
  const requestsHref = `/requests/${clientId}/`
  const [request, setRequest] = useState<ServiceRequest | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // The request is read by id. It used to be looked up in the client's requests
  // list, which is paginated at 20 — anything older was "not found" from a link
  // in an email or a notification.
  const loadRequest = useCallback(async () => {
    try {
      const response = await fetch(`/api/requests/${requestId}/`)
      if (response.status === 404) {
        setError('Το αίτημα δεν βρέθηκε.')
        return
      }
      if (response.status === 401 || response.status === 403) {
        setError('Δεν έχετε πρόσβαση σε αυτό το αίτημα.')
        return
      }
      if (!response.ok) throw new Error('Failed to fetch request')

      const result = await response.json()
      if (result.success && result.request) {
        setRequest(result.request)
      } else {
        setError('Σφάλμα κατά τη φόρτωση του αιτήματος.')
      }
    } catch {
      setError('Σφάλμα κατά τη φόρτωση του αιτήματος.')
    } finally {
      setIsLoading(false)
    }
  }, [requestId])

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
            onClick={() => navigate(requestsHref)}
            disabled={isNavigating(requestsHref)}
            className="flex items-center gap-1 text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors mb-6 disabled:opacity-60"
          >
            {isNavigating(requestsHref) ? <Spinner size="sm" /> : <Icon name="arrow_back" size="sm" />}
            Πίσω στα αιτήματα
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
          onClick={() => navigate(requestsHref)}
          disabled={isNavigating(requestsHref)}
          className="flex items-center gap-1 text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors mb-6 disabled:opacity-60"
        >
          {isNavigating(requestsHref) ? <Spinner size="sm" /> : <Icon name="arrow_back" size="sm" />}
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
