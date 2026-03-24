'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { HiArrowLeft, HiCalendar, HiClock, HiCheckCircle, HiXCircle, HiUserPlus, HiBell, HiPhone, HiPlusCircle } from 'react-icons/hi2'
import { styles } from '../../../styles/styles'
import RequestCard from './RequestCard'
import RequestDetailsModal from './RequestDetailsModal'
import { useToast } from '../../../hooks/useToast'
import { useUser } from '../../../contexts/UserContext'
import { useAuth } from '../../../contexts/AuthContext'
import ClientNavigation from '../../../components/ClientNavigation'
import { SegmentedControl } from '../../../components'
import { ServiceRequestStatus } from '../../../types/statuses'
import type { ServiceRequest } from '../../../types/requests'

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
  }, [clientId, isValidClientId, checkGarageMessages])

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
        return <HiCalendar className="h-5 w-5 text-blue-600" />
      case ServiceRequestStatus.PENDING:
        return <HiClock className="h-5 w-5 text-yellow-600" />
      case ServiceRequestStatus.IN_PROGRESS:
        return <HiClock className="h-5 w-5 text-blue-600" />
      case ServiceRequestStatus.COMPLETED:
        return <HiCheckCircle className="h-5 w-5 text-green-600" />
      case ServiceRequestStatus.CANCELLED:
        return <HiXCircle className="h-5 w-5 text-red-600" />
      default:
        return <HiClock className="h-5 w-5 text-gray-600" />
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
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case ServiceRequestStatus.PENDING:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case ServiceRequestStatus.IN_PROGRESS:
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case ServiceRequestStatus.COMPLETED:
        return 'bg-green-100 text-green-800 border-green-200'
      case ServiceRequestStatus.CANCELLED:
        return 'bg-red-100 text-red-800 border-red-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
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
    setSelectedRequest(request)
    setShowModal(true)
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

  if (isLoading || isRegisteredUser === null) {
    return (
      <section className="bg-white min-h-screen">
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
    <section className="bg-white min-h-screen">
      <ClientNavigation clientId={clientId} />
      <div className={`${styles.container} py-24`}>
        <div className="text-center mb-8">
          <h1 className={styles.pageTitle}>
            Αιτήματα <span className={styles.titleHighlight}>Υπηρεσιών</span>
          </h1>
          {/* <p className={`mt-3 max-w-md mx-auto ${styles.bodyText} sm:text-lg md:mt-5 md:text-xl md:max-w-3xl`}>
            Δείτε όλα τα αιτήματα υπηρεσιών που έχετε κάνει
          </p> */}
          <div className="mt-6">
            <button
              onClick={() => router.push('/')}
              className={`${styles.btnPrimary} flex items-center justify-center gap-2 mx-auto`}
            >
              <HiPlusCircle className="h-5 w-5" />
              Νεο Αίτημα
            </button>
          </div>
        </div>

        {/* Guest User Registration Prompt - Show for all guest users */}
        {!isLoading && isRegisteredUser === false && (
          <div className="max-w-4xl mx-auto mb-8">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                    <HiBell className="h-6 w-6 text-orange-600" />
                  </div>
                </div>
                <div className="flex-1">
                  <p className={`text-lg font-semibold text-gray-900 mb-2`}>
                    Εγγραφείτε για Ειδοποιήσεις
                  </p>
                  
                  <p className={`text-gray-600 mb-4`}>
                    Ως επισκέπτης, μπορείτε να δείτε τα αιτήματά σας, αλλά για να λαμβάνετε{' '}
                    <span className="text-orange-500 font-semibold">
                      ειδοποιήσεις και ενημερώσεις άμεσα από τα συνεργεία
                    </span>
                    , παρακαλώ συμπληρώστε τα στοιχεία σας.
                  </p>

                  {!showRegistrationForm ? (
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={() => setShowRegistrationForm(true)}
                        className={`${styles.btnPrimary} flex items-center justify-center gap-2`}
                      >
                        <HiUserPlus className="h-4 w-4" />
                        Συμπληρώστε Στοιχεία
                      </button>
                      <button
                        onClick={() => router.push('/login')}
                        className={`${styles.btnSecondary} flex items-center justify-center gap-2`}
                      >
                        Σύνδεση
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleFormSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Όνομα
                          </label>
                          <input
                            type="text"
                            value={formData.firstName}
                            onChange={(e) => handleInputChange('firstName', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Επώνυμο
                          </label>
                          <input
                            type="text"
                            value={formData.lastName}
                            onChange={(e) => handleInputChange('lastName', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Email *
                        </label>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => handleInputChange('email', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900"
                          placeholder="π.χ. example@email.com"
                          required
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Απαραίτητο για ειδοποιήσεις και ενημερώσεις
                        </p>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          <HiPhone className="inline h-4 w-4 mr-1" />
                          Τηλέφωνο
                        </label>
                        <input
                          type="tel"
                          value={formData.phoneNumber}
                          onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900"
                          placeholder="π.χ. 6912345678"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Προαιρετικό για SMS ειδοποιήσεις
                        </p>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row gap-3 pt-2">
                        <button
                          type="submit"
                          disabled={isSubmitting || !formData.email}
                          className={`${styles.btnPrimary} flex items-center justify-center gap-2 flex-1 ${
                            isSubmitting || !formData.email ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          {isSubmitting ? 'Αποθήκευση...' : 'Αποθήκευση Στοιχείων'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowRegistrationForm(false)}
                          className={`${styles.btnSecondary} flex items-center justify-center gap-2`}
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

        <div className="max-w-4xl mx-auto">
          {/* Tabs */}
          <div className="mb-6">
            <SegmentedControl
              value={activeTab}
              onChange={(value) =>
                setActiveTab(
                  value === 'appointment'
                    ? 'appointment'
                    : value === 'closed'
                    ? 'closed'
                    : 'open'
                )
              }
              options={[
                { value: 'open', label: `Ανοιχτά (${openRequests.length})` },
                { value: 'appointment', label: `Ραντεβού (${appointmentRequests.length})` },
                { value: 'closed', label: `Περασμένα (${closedRequests.length})` }
              ]}
              variant="orange"
            />
          </div>

          {/* Lists per tab */}
          {activeTab === 'appointment' && appointmentRequests.length > 0 && (
            <div className="mb-8">
              <h2 className={`${styles.sectionTitle} mb-4 flex items-center gap-2`}>
                <HiCalendar className="h-6 w-6 text-blue-600" />
                Ραντεβού ({appointmentRequests.length})
              </h2>
              <div className="space-y-4">
                {appointmentRequests.map((request) => (
                  <RequestCard
                    key={request.id}
                    request={request}
                    onViewDetails={() => handleViewDetails(request)}
                    onChatClick={() => handleChatClick(request.id)}
                    hasGarageMessages={garageMessagesMap[request.id] || false}
                    getStatusIcon={getStatusIcon}
                    getStatusText={getStatusText}
                    getStatusColor={getStatusColor}
                  />
                ))}
              </div>
            </div>
          )}

          {activeTab === 'open' && openRequests.length > 0 && (
            <div className="mb-8">
              <h2 className={`${styles.sectionTitle} mb-4 flex items-center gap-2`}>
                <HiClock className="h-6 w-6 text-yellow-600" />
                Ανοιχτά Αιτήματα ({openRequests.length})
              </h2>
              <div className="space-y-4">
                {openRequests.map((request) => (
                  <RequestCard
                    key={request.id}
                    request={request}
                    onViewDetails={() => handleViewDetails(request)}
                    onChatClick={() => handleChatClick(request.id)}
                    hasGarageMessages={garageMessagesMap[request.id] || false}
                    getStatusIcon={getStatusIcon}
                    getStatusText={getStatusText}
                    getStatusColor={getStatusColor}
                  />
                ))}
              </div>
            </div>
          )}

          {activeTab === 'closed' && closedRequests.length > 0 && (
            <div className="mb-8">
              <h2 className={`${styles.sectionTitle} mb-4 flex items-center gap-2`}>
                <HiCheckCircle className="h-6 w-6 text-green-600" />
                Περασμένα Αιτήματα ({closedRequests.length})
              </h2>
              <div className="space-y-4">
                {closedRequests.map((request) => (
                  <RequestCard
                    key={request.id}
                    request={request}
                    onViewDetails={() => handleViewDetails(request)}
                    onChatClick={() => handleChatClick(request.id)}
                    hasGarageMessages={garageMessagesMap[request.id] || false}
                    getStatusIcon={getStatusIcon}
                    getStatusText={getStatusText}
                    getStatusColor={getStatusColor}
                    disabled={request.status === ServiceRequestStatus.APPOINTMENT && isPastAppointment(request.appointmentDate)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
      {requests.length === 0 && !isLoading && (
        <div className="text-center py-12">
          {isRegisteredUser === false ? (
                // Unauthenticated user prompt
                <div className="max-w-md mx-auto">
                  <div className="mx-auto w-24 h-24 bg-orange-100 rounded-full flex items-center justify-center mb-6">
                    <HiBell className="h-12 w-12 text-orange-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">
                    Μείνετε Ενημερωμένοι!
                  </h3>
                  <p className="text-gray-600 mb-6 leading-relaxed">
                    Ως επισκέπτης, μπορείτε να δείτε τα αιτήματά σας, αλλά για να λαμβάνετε 
                    <strong className="text-orange-600"> ειδοποιήσεις και ενημερώσεις άμεσα από τα συνεργεία</strong>, 
                    παρακαλώ εγγραφείτε ή συνδεθείτε στον λογαριασμό σας.
                  </p>
                  
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <div className="flex items-start gap-3">
                      <HiBell className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div className="text-left">
                        <h4 className="font-medium text-blue-900 mb-1">Πλεονεκτήματα εγγραφής:</h4>
                        <ul className="text-sm text-blue-800 space-y-1">
                          <li>• Άμεσες ειδοποιήσεις για προσφορές</li>
                          <li>• Ενημερώσεις κατάστασης σε πραγματικό χρόνο</li>
                          <li>• Ιστορικό όλων των αιτημάτων σας</li>
                          <li>• Προσωποποιημένη εξυπηρέτηση</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {!showRegistrationForm ? (
                    <>
                      <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <button
                          onClick={() => setShowRegistrationForm(true)}
                          className={`${styles.btnPrimary} flex items-center justify-center gap-2`}
                        >
                          <HiUserPlus className="h-4 w-4" />
                          Συμπληρώστε Στοιχεία
                        </button>
                        <button
                          onClick={() => router.push('/login')}
                          className={`${styles.btnSecondary} flex items-center justify-center gap-2`}
                        >
                          Σύνδεση
                        </button>
                      </div>
                      
                      <p className="text-sm text-gray-500 mt-4">
                        Μπορείτε να συνεχίσετε χωρίς εγγραφή, αλλά θα χάσετε τις άμεσες ειδοποιήσεις.
                      </p>
                    </>
                  ) : (
                    <form onSubmit={handleFormSubmit} className="max-w-md mx-auto space-y-4">
                      <div className="text-left">
                        <h4 className="font-medium text-gray-900 mb-4">Συμπληρώστε τα στοιχεία σας</h4>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Όνομα *
                            </label>
                            <input
                              type="text"
                              value={formData.firstName}
                              onChange={(e) => handleInputChange('firstName', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                              required
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Επώνυμο
                            </label>
                            <input
                              type="text"
                              value={formData.lastName}
                              onChange={(e) => handleInputChange('lastName', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                            />
                          </div>
                        </div>
                        
                        <div className="mt-4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Email
                          </label>
                          <input
                            type="email"
                            value={formData.email}
                            onChange={(e) => handleInputChange('email', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                            placeholder="π.χ. example@email.com"
                          />
                        </div>
                        
                        <div className="mt-4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            <HiPhone className="inline h-4 w-4 mr-1" />
                            Τηλέφωνο *
                          </label>
                          <input
                            type="tel"
                            value={formData.phoneNumber}
                            onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                            placeholder="π.χ. 6912345678"
                            required
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Απαραίτητο για SMS ειδοποιήσεις
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row gap-3 pt-4">
                        <button
                          type="submit"
                          disabled={isSubmitting || !formData.firstName || !formData.phoneNumber}
                          className={`${styles.btnPrimary} flex items-center justify-center gap-2 flex-1 ${
                            isSubmitting || !formData.firstName || !formData.phoneNumber ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          {isSubmitting ? 'Αποθήκευση...' : 'Αποθήκευση Στοιχείων'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowRegistrationForm(false)}
                          className={`${styles.btnSecondary} flex items-center justify-center gap-2`}
                        >
                          Ακύρωση
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ) : (
                // Authenticated user with no requests
                <div>
                  <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    <HiClock className="h-12 w-12 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Δεν υπάρχουν αιτήματα</h3>
                  <p className="text-gray-500 mb-6">Δεν έχετε κάνει ακόμα κανένα αίτημα υπηρεσίας.</p>
                  <button
                    onClick={() => router.push('/')}
                    className={styles.btnPrimary}
                  >
                    Δημιουργία Αιτήματος
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Back Button */}
          <div className="mt-8 text-center">
            <button
              onClick={() => router.back()}
              className={`inline-flex items-center gap-2 ${styles.linkText} font-medium transition-colors duration-200`}
            >
              <HiArrowLeft className="h-4 w-4" />
              Επιστροφή
            </button>
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
      </div>
    </section>
  )
}
