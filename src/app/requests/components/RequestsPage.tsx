'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import LoadMoreButton from '@/components/LoadMoreButton'
import AlertStack from '@/components/AlertStack'
import { useNavigation } from '@/hooks/useNavigation'
import { styles } from '../../../styles/styles'
import RequestCard from './RequestCard'
import OfferSummaryCard from './OfferSummaryCard'
import RequestDetailsModal from './RequestDetailsModal'
import CancellationModal from './CancellationModal'
import GuestAccountPanel from './GuestAccountPanel'
import { useToast } from '../../../hooks/useToast'
// Navigation is handled by AppShell
import { ServiceRequestStatus, OfferStatus } from '../../../types/statuses'
import type { ServiceRequest } from '../../../types/requests'

interface OfferSummary {
  id: string
  offerAmount: number
  appointmentPrice?: number
  status?: OfferStatus
  garageId?: string
  benefits?: string[]
  garage?: {
    companyName?: string
    address?: string
    benefits?: string[]
  } | null
}

interface RequestsPageProps {
  clientId: string
}

// Keyed on the id so moving from one account's list to another's (a guest
// whose requests were just merged into their account) starts from a clean
// slate instead of keeping the previous identity's state and never refetching.
export default function RequestsPage({ clientId }: RequestsPageProps) {
  return <RequestsPageContent key={clientId} clientId={clientId} />
}

function RequestsPageContent({ clientId }: RequestsPageProps) {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')

  const initialTab: 'open' | 'appointment' | 'closed' =
    tabParam === 'appointment' ? 'appointment' : tabParam === 'closed' ? 'closed' : 'open'
  const { success, error } = useToast()
  const { navigate, isNavigating } = useNavigation()
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [isRegisteredUser, setIsRegisteredUser] = useState<boolean | null>(null)
  const [activeTab, setActiveTab] = useState<'open' | 'appointment' | 'closed'>(initialTab)

  // Keep activeTab in sync when the ?tab= search param changes (e.g. from top navigation)
  useEffect(() => {
    const nextTab: 'open' | 'appointment' | 'closed' =
      tabParam === 'appointment' ? 'appointment' : tabParam === 'closed' ? 'closed' : 'open'
    setActiveTab(nextTab)
  }, [tabParam])

  const [garageMessagesMap, setGarageMessagesMap] = useState<Record<string, boolean>>({})
  const [offersMap, setOffersMap] = useState<Record<string, OfferSummary[]>>({})
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  // A guest whose requests now belong to an account: there is nothing left to list.
  const [guestSessionEnded, setGuestSessionEnded] = useState(false)

  // Cancellation state
  const [cancelRequest, setCancelRequest] = useState<ServiceRequest | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  // Check if clientId is valid (starts with 'client-')
  const isValidClientId = clientId && clientId.startsWith('client-')

  const loadRequests = useCallback(async () => {
    try {
      if (!isValidClientId) {
        // If no valid clientId, show empty state
        setRequests([])
        setIsRegisteredUser(false)
        setIsLoading(false)
        return
      }

      // First, check if user is registered by fetching client info
      try {
        const clientResponse = await fetch(`/api/clients/${clientId}/`)
        if (clientResponse.ok) {
          const clientData = await clientResponse.json()
          // Check if user has email (indicates they're registered)
          const hasEmail = !!clientData.client?.email
          setIsRegisteredUser(hasEmail)
        } else {
          console.log('Client response not ok:', clientResponse.status)
          setIsRegisteredUser(false)
        }
      } catch (error) {
        console.error('Error checking user registration:', error)
        setIsRegisteredUser(false)
      }

      // include=summary returns the offers and the has-a-garage-written flags
      // alongside the requests. This page used to fetch those per request — and
      // one extra call per offer to name its garage — so a client with 10
      // requests opened dozens of connections just to render the list.
      const response = await fetch(`/api/requests/?clientId=${clientId}&include=summary`)

      if (!response.ok) {
        throw new Error('Failed to fetch requests')
      }

      const result = await response.json()

      if (result.success) {
        setRequests(result.requests)
        setGarageMessagesMap(result.garageMessages || {})
        setOffersMap(result.offers || {})
        setNextCursor(result.nextCursor || null)
      } else {
        console.error('API error:', result.error)
        setRequests([])
      }
    } catch (error) {
      console.error('Error loading requests:', error)
      setRequests([])
    } finally {
      setIsLoading(false)
    }
  }, [clientId, isValidClientId])

  // The list is paged (newest first) — without this a client with more than one
  // page of history never saw their older requests at all.
  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return
    setIsLoadingMore(true)
    try {
      const response = await fetch(
        `/api/requests/?clientId=${clientId}&include=summary&cursor=${encodeURIComponent(nextCursor)}`
      )
      const result = response.ok ? await response.json() : null
      if (!result?.success) throw new Error('Failed to fetch requests')

      setRequests((prev) => {
        const seen = new Set(prev.map((r) => r.id))
        return [...prev, ...(result.requests as ServiceRequest[]).filter((r) => !seen.has(r.id))]
      })
      setGarageMessagesMap((prev) => ({ ...prev, ...(result.garageMessages || {}) }))
      setOffersMap((prev) => ({ ...prev, ...(result.offers || {}) }))
      setNextCursor(result.nextCursor || null)
    } catch {
      error('Σφάλμα', 'Δεν ήταν δυνατή η φόρτωση παλαιότερων αιτημάτων.')
    } finally {
      setIsLoadingMore(false)
    }
  }, [clientId, error, isLoadingMore, nextCursor])

  // Load requests on component mount. AuthContext already handles auth state
  // — no need to re-fetch the client here. Just keep localStorage in sync.
  useEffect(() => {
    localStorage.removeItem('garageId')
    const storedClientId = localStorage.getItem('clientId')
    if (storedClientId !== clientId) {
      localStorage.setItem('clientId', clientId)
    }
    loadRequests()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Helper function to check if appointment date has passed
  const isPastAppointment = (appointmentDate?: string): boolean => {
    if (!appointmentDate) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const appointment = new Date(`${appointmentDate}T00:00:00`)
    appointment.setHours(0, 0, 0, 0)
    return appointment < today
  }

  // Sort requests by status priority and then by date (latest first)
  const sortedRequests = [...requests].sort((a, b) => {
    // Define status priority order
    const statusPriority: Record<ServiceRequestStatus, number> = {
      [ServiceRequestStatus.APPOINTMENT]: 1,
      [ServiceRequestStatus.PENDING]: 2,
      [ServiceRequestStatus.IN_PROGRESS]: 2,
      [ServiceRequestStatus.COMPLETED]: 3,
      [ServiceRequestStatus.CANCELLED]: 3
    }

    const aPriority = statusPriority[a.status] || 4
    const bPriority = statusPriority[b.status] || 4

    // First sort by status priority
    if (aPriority !== bPriority) {
      return aPriority - bPriority
    }

    // Then sort by date (latest first)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  // Group requests by status
  const allAppointmentRequests = sortedRequests.filter(r => r.status === ServiceRequestStatus.APPOINTMENT)

  // Split appointments into future and past
  const futureAppointments = allAppointmentRequests
    .filter(r => !isPastAppointment(r.appointmentDate))
    .sort((a, b) => {
      // Sort future appointments by appointmentDate (earliest first)
      if (!a.appointmentDate && !b.appointmentDate) return 0
      if (!a.appointmentDate) return 1
      if (!b.appointmentDate) return -1

      const dateA = new Date(`${a.appointmentDate}T00:00:00`).getTime()
      const dateB = new Date(`${b.appointmentDate}T00:00:00`).getTime()
      return dateA - dateB
    })

  const pastAppointments = allAppointmentRequests
    .filter(r => isPastAppointment(r.appointmentDate))
    .sort((a, b) => {
      // Sort past appointments by appointmentDate (most recent first)
      if (!a.appointmentDate && !b.appointmentDate) return 0
      if (!a.appointmentDate) return 1
      if (!b.appointmentDate) return -1

      const dateA = new Date(`${a.appointmentDate}T00:00:00`).getTime()
      const dateB = new Date(`${b.appointmentDate}T00:00:00`).getTime()
      return dateB - dateA
    })

  const appointmentRequests = futureAppointments
  const openRequests = sortedRequests.filter(r => r.status === ServiceRequestStatus.PENDING || r.status === ServiceRequestStatus.IN_PROGRESS)
  const closedRequests = [
    ...sortedRequests.filter(r => r.status === ServiceRequestStatus.COMPLETED || r.status === ServiceRequestStatus.CANCELLED),
    ...pastAppointments
  ]

  const detailsHref = (requestId: string) => `/requests/${clientId}/details/${requestId}/`
  const chatHref = (requestId: string) => `/requests/${clientId}/chats/${requestId}/`

  const handleViewDetails = (request: ServiceRequest) => {
    navigate(detailsHref(request.id))
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setSelectedRequest(null)
  }

  const handleRequestUpdate = (updatedRequest: ServiceRequest) => {
    setRequests((prevRequests) =>
      prevRequests.map((request) =>
        request.id === updatedRequest.id ? { ...request, ...updatedRequest } : request
      )
    )
    setSelectedRequest(updatedRequest)
  }

  const handleChatClick = (requestId: string) => {
    // Navigate to the client's individual chat page
    navigate(chatHref(requestId))
  }

  const openCancel = (request: ServiceRequest | null) => {
    setCancelError(null)
    setCancelRequest(request)
  }

  const handleCancelAppointment = async () => {
    if (!cancelRequest) return
    setCancelLoading(true)
    setCancelError(null)
    try {
      const res = await fetch(`/api/requests/${cancelRequest.id}/cancel/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // 409: the appointment has started or the request changed meanwhile —
        // the list is stale, so bring it up to date behind the message.
        if (res.status === 409) loadRequests()
        setCancelError(data.error || 'Δεν ήταν δυνατή η ακύρωση.')
        return
      }

      // Update local state
      setRequests((prev) =>
        prev.map((r) =>
          r.id === cancelRequest.id
            ? { ...r, status: ServiceRequestStatus.CANCELLED }
            : r
        )
      )

      if (data.refundPoints) {
        success('Ακύρωση', `Το ραντεβού ακυρώθηκε. ${data.refundPoints} πόντοι πιστώθηκαν στο πορτοφόλι σας.`)
      } else {
        success('Ακύρωση', 'Το ραντεβού ακυρώθηκε.')
      }
      openCancel(null)
    } catch {
      setCancelError('Δεν ήταν δυνατή η ακύρωση.')
    } finally {
      setCancelLoading(false)
    }
  }

  // Tab data
  const tabs = [
    { key: 'open' as const, label: 'Αιτήματα', count: openRequests.length, icon: 'pending_actions' },
    { key: 'appointment' as const, label: 'Ραντεβού', count: appointmentRequests.length, icon: 'event' },
    { key: 'closed' as const, label: 'Ολοκληρωμένα', count: closedRequests.length, icon: 'task_alt' }
  ]

  const currentRequests =
    activeTab === 'open' ? openRequests :
    activeTab === 'appointment' ? appointmentRequests :
    closedRequests

  if (isLoading || isRegisteredUser === null) {
    return (
      <section className="bg-surface">
        <div className={styles.pageCenter}>
          <div className="text-center">
            <div className={styles.loadingSpinner}></div>
            <p className={styles.bodyText}>Φόρτωση αιτημάτων...</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="bg-surface">
      <div className="px-5 max-w-4xl mx-auto pt-2 pb-4">
        {/* Page header */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold tracking-tight mb-2">Τα Αιτήματά μου</h2>
          <p className="text-on-surface-variant text-sm">Διαχειριστείτε τα αιτήματα και τα ραντεβού σας.</p>
        </div>

        {/* Renders nothing when there is nothing waiting on the user. */}
        <AlertStack className="mb-6" />

        {isRegisteredUser === false && (
          <GuestAccountPanel
            guestId={clientId}
            onRegistered={() => {
              setIsRegisteredUser(true)
              loadRequests()
            }}
            onSessionEnded={() => {
              setGuestSessionEnded(true)
              setRequests([])
              setOffersMap({})
              setGarageMessagesMap({})
              setNextCursor(null)
            }}
          />
        )}

        {!guestSessionEnded && (<>
        {/* Sticky tab bar */}
        <div className="sticky top-16 z-40 bg-surface/80 backdrop-blur-md -mx-5 px-5 py-3 mb-6">
          <div className="flex items-center justify-between border-b border-outline-variant/20">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative pb-3 text-sm font-bold tracking-tight transition-colors ${
                  activeTab === tab.key
                    ? 'text-primary'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <div className="active-tab-indicator" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Request list */}
        <div className="space-y-6">
          {currentRequests.length > 0 ? (
            currentRequests.map((request) => {
              const requestOffers = offersMap[request.id] || []
              const hasRequestOffers = requestOffers.length > 0

              return (
                <div key={request.id}>
                  <RequestCard
                    request={request}
                    onViewDetails={() => handleViewDetails(request)}
                    onChatClick={() => handleChatClick(request.id)}
                    onCancelClick={
                      request.status === ServiceRequestStatus.APPOINTMENT
                        ? () => openCancel(request)
                        : undefined
                    }
                    pendingAction={
                      isNavigating(detailsHref(request.id))
                        ? 'details'
                        : isNavigating(chatHref(request.id))
                          ? 'chat'
                          : null
                    }
                    hasGarageMessages={garageMessagesMap[request.id] || false}
                    getStatusIcon={getStatusIcon}
                    getStatusText={getStatusText}
                    getStatusColor={getStatusColor}
                    disabled={
                      activeTab === 'closed' &&
                      request.status === ServiceRequestStatus.APPOINTMENT &&
                      isPastAppointment(request.appointmentDate)
                    }
                    hasOffers={hasRequestOffers}
                  />
                  {hasRequestOffers && requestOffers.map((offer, index) => (
                    <OfferSummaryCard
                      key={offer.id}
                      offer={offer}
                      index={index}
                      isLast={index === requestOffers.length - 1}
                      onClick={() => handleViewDetails(request)}
                    />
                  ))}
                </div>
              )
            })
          ) : (
            /* Empty states */
            requests.length === 0 && !isLoading ? (
              isRegisteredUser === false ? (
                /* Guest with nothing to list — the panel above carries the prompt. */
                <div className="text-center py-12">
                  <div className="mx-auto w-16 h-16 bg-surface-container rounded-full flex items-center justify-center mb-4">
                    <Icon name="inbox" className="text-on-surface-variant" size="lg" />
                  </div>
                  <p className="text-sm text-on-surface-variant">Δεν υπάρχουν αιτήματα</p>
                </div>
              ) : (
                /* Authenticated user with no requests */
                <div className="text-center py-16">
                  <div className="mx-auto w-20 h-20 bg-surface-container rounded-full flex items-center justify-center mb-4">
                    <Icon name="inbox" className="text-on-surface-variant" size="xl" />
                  </div>
                  <h3 className="text-lg font-bold text-on-surface mb-2">Δεν υπάρχουν αιτήματα</h3>
                  <p className="text-sm text-on-surface-variant mb-6">Δεν έχετε κάνει ακόμα κανένα αίτημα υπηρεσίας.</p>
                  <button
                    onClick={() => navigate('/')}
                    disabled={isNavigating('/')}
                    className={styles.btnPrimary}
                  >
                    {isNavigating('/')
                      ? <Spinner size="sm" />
                      : <Icon name="add_circle" filled size="sm" />}
                    Δημιουργία Αιτήματος
                  </button>
                </div>
              )
            ) : (
              /* Tab has no requests but other tabs might */
              <div className="text-center py-12">
                <div className="mx-auto w-16 h-16 bg-surface-container rounded-full flex items-center justify-center mb-4">
                  <Icon
                    name={activeTab === 'open' ? 'pending_actions' : activeTab === 'appointment' ? 'event' : 'task_alt'}
                    className="text-on-surface-variant"
                    size="lg"
                  />
                </div>
                <p className="text-sm text-on-surface-variant">
                  {activeTab === 'open' && 'Δεν υπάρχουν ανοιχτά αιτήματα'}
                  {activeTab === 'appointment' && 'Δεν υπάρχουν ενεργά ραντεβού'}
                  {activeTab === 'closed' && 'Δεν υπάρχουν ολοκληρωμένα αιτήματα'}
                </p>
              </div>
            )
          )}
        </div>

        {/* The list is newest-first per page, so older requests only appear
            after asking for them; the tabs then re-sort what has loaded. */}
        <LoadMoreButton
          onClick={loadMore}
          loading={isLoadingMore}
          hasMore={!!nextCursor}
          label="Παλαιότερα αιτήματα"
          className="mt-6"
        />
        </>)}

      </div>

      {/* Request Details Modal */}
      {showModal && selectedRequest && (
        <RequestDetailsModal
          request={selectedRequest}
          onClose={handleCloseModal}
          onRequestUpdate={handleRequestUpdate}
          getStatusIcon={getStatusIcon}
          getStatusText={getStatusText}
          getStatusColor={getStatusColor}
        />
      )}

      {/* Cancellation Modal */}
      {cancelRequest && (
        <CancellationModal
          isOpen={!!cancelRequest}
          onClose={() => openCancel(null)}
          request={cancelRequest}
          onConfirm={handleCancelAppointment}
          isLoading={cancelLoading}
          error={cancelError}
        />
      )}
    </section>
  )
}
