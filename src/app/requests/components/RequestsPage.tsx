'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { HiArrowLeft, HiCalendar, HiClock, HiCheckCircle, HiXCircle, HiUserPlus, HiBell, HiPhone } from 'react-icons/hi2'
import { styles } from '../../../styles/styles'
import RequestCard from './RequestCard'
import RequestDetailsModal from './RequestDetailsModal'
import { useToast } from '../../../hooks/useToast'
import { useUser } from '../../../contexts/UserContext'

interface ServiceRequest {
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
}

interface RequestsPageProps {
  clientId: string
}

export default function RequestsPage({ clientId }: RequestsPageProps) {
  const router = useRouter()
  const { success, error } = useToast()
  const { refreshUser } = useUser()
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [isRegisteredUser, setIsRegisteredUser] = useState<boolean | null>(null)
  
  // Registration form state
  const [showRegistrationForm, setShowRegistrationForm] = useState(false)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

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

  // Load requests on component mount and store clientId in localStorage
  useEffect(() => {
    // Store clientId in localStorage for user context
    localStorage.setItem('clientId', clientId)
    loadRequests()
  }, [clientId, loadRequests])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'appointment':
        return <HiCalendar className="h-5 w-5 text-blue-600" />
      case 'pending':
        return <HiClock className="h-5 w-5 text-yellow-600" />
      case 'in-progress':
        return <HiClock className="h-5 w-5 text-blue-600" />
      case 'completed':
        return <HiCheckCircle className="h-5 w-5 text-green-600" />
      case 'cancelled':
        return <HiXCircle className="h-5 w-5 text-red-600" />
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

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'high':
        return 'bg-red-100 text-red-800'
      case 'normal':
        return 'bg-blue-100 text-blue-800'
      case 'low':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
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
        return 'Κανονική'
    }
  }

  // Sort requests by status priority and then by date (latest first)
  const sortedRequests = [...requests].sort((a, b) => {
    // Define status priority order
    const statusPriority = {
      'appointment': 1,
      'pending': 2,
      'in-progress': 2,
      'completed': 3,
      'cancelled': 3
    }

    const aPriority = statusPriority[a.status as keyof typeof statusPriority] || 4
    const bPriority = statusPriority[b.status as keyof typeof statusPriority] || 4

    // First sort by status priority
    if (aPriority !== bPriority) {
      return aPriority - bPriority
    }

    // Then sort by date (latest first)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  // Group requests by status
  const appointmentRequests = sortedRequests.filter(r => r.status === 'appointment')
  const openRequests = sortedRequests.filter(r => r.status === 'pending' || r.status === 'in-progress')
  const closedRequests = sortedRequests.filter(r => r.status === 'completed' || r.status === 'cancelled')

  const handleViewDetails = (request: ServiceRequest) => {
    setSelectedRequest(request)
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setSelectedRequest(null)
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const response = await fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        // Update the user as registered
        setIsRegisteredUser(true)
        setShowRegistrationForm(false)
        // Refresh user context to update header
        await refreshUser(clientId)
        // Reload requests to show updated data
        loadRequests()
        success('Επιτυχής Αποθήκευση', 'Τα στοιχεία σας αποθηκεύτηκαν επιτυχώς! Τώρα θα λαμβάνετε ειδοποιήσεις.')
      } else {
        const errorData = await response.json()
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
      <div className={`${styles.container} py-24`}>
        <div className="text-center mb-8">
          <h1 className={styles.pageTitle}>
            Αιτήματα <span className={styles.titleHighlight}>Υπηρεσιών</span>
          </h1>
          <p className={`mt-3 max-w-md mx-auto ${styles.bodyText} sm:text-lg md:mt-5 md:text-xl md:max-w-3xl`}>
            Δείτε όλα τα αιτήματα υπηρεσιών που έχετε κάνει
          </p>
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
          {/* Appointment Requests */}
          {appointmentRequests.length > 0 && (
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
                    getStatusIcon={getStatusIcon}
                    getStatusText={getStatusText}
                    getStatusColor={getStatusColor}
                    getUrgencyColor={getUrgencyColor}
                    getUrgencyText={getUrgencyText}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Open/Pending Requests */}
          {openRequests.length > 0 && (
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
                    getStatusIcon={getStatusIcon}
                    getStatusText={getStatusText}
                    getStatusColor={getStatusColor}
                    getUrgencyColor={getUrgencyColor}
                    getUrgencyText={getUrgencyText}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Closed Requests */}
          {closedRequests.length > 0 && (
            <div className="mb-8">
              <h2 className={`${styles.sectionTitle} mb-4 flex items-center gap-2`}>
                <HiCheckCircle className="h-6 w-6 text-green-600" />
                Κλειστά Αιτήματα ({closedRequests.length})
              </h2>
              <div className="space-y-4">
                {closedRequests.map((request) => (
                  <RequestCard
                    key={request.id}
                    request={request}
                    onViewDetails={() => handleViewDetails(request)}
                    getStatusIcon={getStatusIcon}
                    getStatusText={getStatusText}
                    getStatusColor={getStatusColor}
                    getUrgencyColor={getUrgencyColor}
                    getUrgencyText={getUrgencyText}
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
            getStatusIcon={getStatusIcon}
            getStatusText={getStatusText}
            getStatusColor={getStatusColor}
            getUrgencyColor={getUrgencyColor}
            getUrgencyText={getUrgencyText}
          />
        )}
      </div>
    </section>
  )
}
