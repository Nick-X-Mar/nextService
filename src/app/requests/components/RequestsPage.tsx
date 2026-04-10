'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Icon from '@/components/ui/Icon'
import { styles } from '../../../styles/styles'
import RequestCard from './RequestCard'
import OfferSummaryCard from './OfferSummaryCard'
import RequestDetailsModal from './RequestDetailsModal'
import CancellationModal from './CancellationModal'
import { useToast } from '../../../hooks/useToast'
import { useUser } from '../../../contexts/UserContext'
import { useAuth } from '../../../contexts/AuthContext'
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

export default function RequestsPage({ clientId }: RequestsPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')

  const initialTab: 'open' | 'appointment' | 'closed' =
    tabParam === 'appointment' ? 'appointment' : tabParam === 'closed' ? 'closed' : 'open'
  const { success, error } = useToast()
  const { refreshUser } = useUser()
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

  // Registration form state
  const [showRegistrationForm, setShowRegistrationForm] = useState(false)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [garageMessagesMap, setGarageMessagesMap] = useState<Record<string, boolean>>({})
  const [offersMap, setOffersMap] = useState<Record<string, OfferSummary[]>>({})

  // Cancellation state
  const [cancelRequest, setCancelRequest] = useState<ServiceRequest | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)

  // Check if clientId is valid (starts with 'client-')
  const isValidClientId = clientId && clientId.startsWith('client-')

  const checkGarageMessages = useCallback(async (requestIds: string[]) => {
    const messagesMap: Record<string, boolean> = {}

    // Check each request for garage messages
    for (const requestId of requestIds) {
      try {
        const response = await fetch(`/api/chat/${requestId}/garages`)
        if (response.ok) {
          const data = await response.json()
          messagesMap[requestId] = data.garages && data.garages.length > 0
        } else {
          messagesMap[requestId] = false
        }
      } catch (error) {
        console.error(`Error checking garage messages for request ${requestId}:`, error)
        messagesMap[requestId] = false
      }
    }

    setGarageMessagesMap(messagesMap)
  }, [])

  const loadOffersForRequests = useCallback(async (requestIds: string[]) => {
    const map: Record<string, OfferSummary[]> = {}

    await Promise.all(
      requestIds.map(async (requestId) => {
        try {
          const response = await fetch(`/api/offers?serviceRequestId=${requestId}`)
          if (!response.ok) return
          const data = await response.json()
          const offers = data.offers || data
          if (!Array.isArray(offers) || offers.length === 0) return

          // Fetch garage details for each offer
          const offersWithGarage: OfferSummary[] = await Promise.all(
            offers.map(async (offer: OfferSummary) => {
              if (!offer.garageId) return offer
              try {
                const garageRes = await fetch(`/api/garage/${offer.garageId}`)
                if (garageRes.ok) {
                  const garageResult = await garageRes.json()
                  const garageData = garageResult.garage || garageResult
                  return {
                    ...offer,
                    garage: {
                      companyName: garageData.companyName,
                      address: garageData.address,
                      benefits: Array.isArray(garageData.benefits) ? garageData.benefits : []
                    }
                  }
                }
              } catch {
                // ignore garage fetch errors
              }
              return offer
            })
          )

          map[requestId] = offersWithGarage
        } catch {
          // ignore individual request offer fetch errors
        }
      })
    )

    setOffersMap(map)
  }, [])

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
        const clientResponse = await fetch(`/api/clients/${clientId}`)
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

      // Fetch requests from API
      const response = await fetch(`/api/requests?clientId=${clientId}`)

      if (!response.ok) {
        throw new Error('Failed to fetch requests')
      }

      const result = await response.json()

      if (result.success) {
        setRequests(result.requests)
        // Check for garage messages for all requests
        const requestIds = result.requests.map((req: ServiceRequest) => req.id)
        if (requestIds.length > 0) {
          checkGarageMessages(requestIds)
          loadOffersForRequests(requestIds)
        }
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
  }, [clientId, isValidClientId, checkGarageMessages, loadOffersForRequests])

  const { refreshClient } = useAuth()

  // Load requests on component mount and update auth context
  useEffect(() => {
    // Clear garage authentication if exists
    localStorage.removeItem('garageId')
    // Store clientId in localStorage and refresh auth context
    const storedClientId = localStorage.getItem('clientId')
    if (storedClientId !== clientId) {
      localStorage.setItem('clientId', clientId)
      refreshClient(clientId)
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

  const handleViewDetails = (request: ServiceRequest) => {
    router.push(`/requests/${clientId}/details/${request.id}`)
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
    router.push(`/requests/${clientId}/chats/${requestId}`)
  }

  const handleCancelAppointment = async () => {
    if (!cancelRequest) return
    setCancelLoading(true)
    try {
      const res = await fetch(`/api/requests/${cancelRequest.id}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

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
      setCancelRequest(null)
    } catch (err) {
      error('Σφάλμα', 'Δεν ήταν δυνατή η ακύρωση.')
    } finally {
      setCancelLoading(false)
    }
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // Check if there's pending registration data from a service request
      const pendingDataStr = localStorage.getItem('pendingRegistrationData')
      let pendingData = null

      if (pendingDataStr) {
        pendingData = JSON.parse(pendingDataStr)
        // Check if the data is not too old (within 1 hour)
        const oneHourAgo = Date.now() - (60 * 60 * 1000)
        if (pendingData.timestamp < oneHourAgo) {
          // Data is too old, ignore it
          pendingData = null
          localStorage.removeItem('pendingRegistrationData')
        }
      }

      let response

      if (formData.email) {
        // Use the new endpoint that handles email deduplication and vehicle merging
        response = await fetch('/api/auth/register-from-requests', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            guestClientId: clientId,
            email: formData.email,
            firstName: formData.firstName,
            lastName: formData.lastName,
            phoneNumber: formData.phoneNumber
          }),
        })
      } else {
        // Use the regular client update endpoint (no email provided)
        response = await fetch(`/api/clients/${clientId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formData),
        })
      }

      if (response.ok) {
        const data = await response.json()

        // Clear pending registration data since we've processed it
        if (pendingData) {
          localStorage.removeItem('pendingRegistrationData')
        }

        // Update the user as registered
        setIsRegisteredUser(true)
        setShowRegistrationForm(false)

        // If we used the new endpoint and got a different client ID, update localStorage
        if (formData.email && data.client && data.client.id !== clientId) {
          console.log('RequestsPage: Updating clientId from', clientId, 'to', data.client.id)
          localStorage.removeItem('garageId')
          localStorage.setItem('clientId', data.client.id)
          console.log('RequestsPage: Calling refreshUser with new clientId:', data.client.id)
          await refreshUser(data.client.id)

          // Show success message before redirect
          let message = 'Συνδεθήκατε επιτυχώς στον υπάρχοντα λογαριασμό σας!'
          if (data.vehicleDeduplicated) {
            message += ' Βρέθηκαν και συνδέθηκαν τα υπάρχοντα οχήματά σας.'
          }
          message += ' Τώρα θα λαμβάνετε ειδοποιήσεις.'

          success('Επιτυχής Σύνδεση', message)

          // Use a timeout to allow the success message to show before redirect
          setTimeout(() => {
            try {
              window.location.href = `/requests/${data.client.id}`
            } catch (redirectError) {
              console.error('Redirect failed:', redirectError)
              // Fallback: reload the page with the new client ID
              window.location.reload()
            }
          }, 1500)
          return // Exit early to prevent further execution
        } else {
          // Refresh user context to update header
          console.log('RequestsPage: Calling refreshUser for existing client:', data.client?.id || clientId)
          await refreshUser(data.client?.id || clientId)
        }

        // Reload requests to show updated data
        loadRequests()

        let message = 'Τα στοιχεία σας αποθηκεύτηκαν επιτυχώς! Τώρα θα λαμβάνετε ειδοποιήσεις.'

        if (formData.email && data.isExistingUser) {
          message = 'Συνδεθήκατε επιτυχώς στον υπάρχοντα λογαριασμό σας!'
          if (data.vehicleDeduplicated) {
            message += ' Βρέθηκαν και συνδέθηκαν τα υπάρχοντα οχήματά σας.'
          }
          message += ' Τώρα θα λαμβάνετε ειδοποιήσεις.'
        }

        success('Επιτυχής Αποθήκευση', message)
      } else {
        const errorData = await response.json()
        console.error('Registration error details:', errorData)
        error('Σφάλμα Αποθήκευσης', errorData.error || 'Δεν ήταν δυνατή η αποθήκευση των στοιχείων')
      }
    } catch (err) {
      console.error('Error updating client:', err)
      error('Σφάλμα', 'Σφάλμα κατά την αποθήκευση των στοιχείων')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  // Tab data
  const tabs = [
    { key: 'open' as const, label: 'Αιτήματα', count: openRequests.length, icon: 'pending_actions' },
    { key: 'appointment' as const, label: 'Ραντεβού', count: appointmentRequests.length, icon: 'event' },
    { key: 'closed' as const, label: 'Κλειστά', count: closedRequests.length, icon: 'task_alt' }
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

        {/* Guest User Registration Prompt */}
        {!isLoading && isRegisteredUser === false && requests.length > 0 && (
          <div className="max-w-4xl mb-6">
            <div className="bg-surface-container-lowest rounded-xl p-5 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-primary/20">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                    <Icon name="notifications_active" filled className="text-primary" size="lg" />
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-base font-bold text-on-surface mb-1">
                    Εγγραφείτε για Ειδοποιήσεις
                  </p>

                  <p className="text-sm text-on-surface-variant mb-4">
                    Ως επισκέπτης, μπορείτε να δείτε τα αιτήματά σας, αλλά για να λαμβάνετε{' '}
                    <span className="text-primary font-bold">
                      ειδοποιήσεις και ενημερώσεις άμεσα από τα συνεργεία
                    </span>
                    , παρακαλώ συμπληρώστε τα στοιχεία σας.
                  </p>

                  {!showRegistrationForm ? (
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={() => setShowRegistrationForm(true)}
                        className={`${styles.btnPrimary}`}
                      >
                        <Icon name="person_add" size="sm" />
                        Συμπληρώστε Στοιχεία
                      </button>
                      <button
                        onClick={() => router.push('/login')}
                        className={`${styles.btnOutline}`}
                      >
                        Σύνδεση
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleFormSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className={styles.label}>Όνομα</label>
                          <input
                            type="text"
                            value={formData.firstName}
                            onChange={(e) => handleInputChange('firstName', e.target.value)}
                            className={styles.input}
                          />
                        </div>
                        <div>
                          <label className={styles.label}>Επώνυμο</label>
                          <input
                            type="text"
                            value={formData.lastName}
                            onChange={(e) => handleInputChange('lastName', e.target.value)}
                            className={styles.input}
                          />
                        </div>
                      </div>
                      <div>
                        <label className={styles.label}>Email *</label>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => handleInputChange('email', e.target.value)}
                          className={styles.input}
                          placeholder="example@email.com"
                          required
                        />
                        <p className="text-xs text-on-surface-variant mt-1">
                          Απαραίτητο για ειδοποιήσεις και ενημερώσεις
                        </p>
                      </div>
                      <div>
                        <label className={styles.label}>
                          <Icon name="phone" size="sm" className="inline mr-1 align-text-bottom" />
                          Τηλέφωνο
                        </label>
                        <input
                          type="tel"
                          value={formData.phoneNumber}
                          onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                          className={styles.input}
                          placeholder="6912345678"
                        />
                        <p className="text-xs text-on-surface-variant mt-1">
                          Προαιρετικό για SMS ειδοποιήσεις
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3 pt-2">
                        <button
                          type="submit"
                          disabled={isSubmitting || !formData.email}
                          className={`${styles.btnPrimary} flex-1 justify-center ${
                            isSubmitting || !formData.email ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          {isSubmitting ? 'Αποθήκευση...' : 'Αποθήκευση Στοιχείων'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowRegistrationForm(false)}
                          className={`${styles.btnOutline} justify-center`}
                        >
                          Ακύρωση
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

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
                        ? () => setCancelRequest(request)
                        : undefined
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
                /* Unauthenticated user prompt */
                <div className="text-center py-16">
                  <div className="max-w-sm mx-auto">
                    <div className="mx-auto w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                      <Icon name="notifications_active" filled className="text-primary" size="xl" />
                    </div>
                    <h3 className="text-xl font-bold text-on-surface mb-2">
                      Μείνετε Ενημερωμένοι!
                    </h3>
                    <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">
                      Ως επισκέπτης, μπορείτε να δείτε τα αιτήματά σας, αλλά για να λαμβάνετε
                      <strong className="text-primary"> ειδοποιήσεις και ενημερώσεις άμεσα από τα συνεργεία</strong>,
                      παρακαλώ εγγραφείτε ή συνδεθείτε.
                    </p>

                    <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/10 mb-6 text-left">
                      <div className="flex items-start gap-3">
                        <Icon name="info" className="text-blue-600 flex-shrink-0 mt-0.5" size="md" />
                        <div>
                          <h4 className="text-sm font-bold text-on-surface mb-2">Πλεονεκτήματα εγγραφής:</h4>
                          <ul className="text-xs text-on-surface-variant space-y-1.5">
                            <li className="flex items-center gap-1.5">
                              <Icon name="check" size="sm" className="text-green-600" />
                              Άμεσες ειδοποιήσεις για προσφορές
                            </li>
                            <li className="flex items-center gap-1.5">
                              <Icon name="check" size="sm" className="text-green-600" />
                              Ενημερώσεις κατάστασης σε πραγματικό χρόνο
                            </li>
                            <li className="flex items-center gap-1.5">
                              <Icon name="check" size="sm" className="text-green-600" />
                              Ιστορικό όλων των αιτημάτων σας
                            </li>
                            <li className="flex items-center gap-1.5">
                              <Icon name="check" size="sm" className="text-green-600" />
                              Προσωποποιημένη εξυπηρέτηση
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {!showRegistrationForm ? (
                      <>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                          <button
                            onClick={() => setShowRegistrationForm(true)}
                            className={styles.btnPrimary}
                          >
                            <Icon name="person_add" size="sm" />
                            Συμπληρώστε Στοιχεία
                          </button>
                          <button
                            onClick={() => router.push('/login')}
                            className={styles.btnOutline}
                          >
                            Σύνδεση
                          </button>
                        </div>
                        <p className="text-xs text-on-surface-variant mt-4">
                          Μπορείτε να συνεχίσετε χωρίς εγγραφή, αλλά θα χάσετε τις άμεσες ειδοποιήσεις.
                        </p>
                      </>
                    ) : (
                      <form onSubmit={handleFormSubmit} className="max-w-md mx-auto space-y-4 text-left">
                        <h4 className="text-sm font-bold text-on-surface">Συμπληρώστε τα στοιχεία σας</h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className={styles.label}>Όνομα *</label>
                            <input
                              type="text"
                              value={formData.firstName}
                              onChange={(e) => handleInputChange('firstName', e.target.value)}
                              className={styles.input}
                              required
                            />
                          </div>
                          <div>
                            <label className={styles.label}>Επώνυμο</label>
                            <input
                              type="text"
                              value={formData.lastName}
                              onChange={(e) => handleInputChange('lastName', e.target.value)}
                              className={styles.input}
                            />
                          </div>
                        </div>

                        <div>
                          <label className={styles.label}>Email</label>
                          <input
                            type="email"
                            value={formData.email}
                            onChange={(e) => handleInputChange('email', e.target.value)}
                            className={styles.input}
                            placeholder="example@email.com"
                          />
                        </div>

                        <div>
                          <label className={styles.label}>
                            <Icon name="phone" size="sm" className="inline mr-1 align-text-bottom" />
                            Τηλέφωνο *
                          </label>
                          <input
                            type="tel"
                            value={formData.phoneNumber}
                            onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                            className={styles.input}
                            placeholder="6912345678"
                            required
                          />
                          <p className="text-xs text-on-surface-variant mt-1">
                            Απαραίτητο για SMS ειδοποιήσεις
                          </p>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 pt-2">
                          <button
                            type="submit"
                            disabled={isSubmitting || !formData.firstName || !formData.phoneNumber}
                            className={`${styles.btnPrimary} flex-1 justify-center ${
                              isSubmitting || !formData.firstName || !formData.phoneNumber ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                          >
                            {isSubmitting ? 'Αποθήκευση...' : 'Αποθήκευση Στοιχείων'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowRegistrationForm(false)}
                            className={`${styles.btnOutline} justify-center`}
                          >
                            Ακύρωση
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
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
                    onClick={() => router.push('/')}
                    className={styles.btnPrimary}
                  >
                    <Icon name="add_circle" filled size="sm" />
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
                  {activeTab === 'closed' && 'Δεν υπάρχουν κλειστά αιτήματα'}
                </p>
              </div>
            )
          )}
        </div>

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
          onClose={() => setCancelRequest(null)}
          request={cancelRequest}
          onConfirm={handleCancelAppointment}
          isLoading={cancelLoading}
        />
      )}
    </section>
  )
}
