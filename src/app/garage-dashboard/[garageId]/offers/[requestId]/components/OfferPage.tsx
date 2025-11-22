'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, Button, Input, Checkbox, ServiceVehicleCard } from '@/components'
import { styles } from '@/styles/styles'
import { OfferStatus } from '@/types/statuses'
import { DayPicker } from 'react-day-picker'
import { addDays, addWeeks, isWeekend, startOfDay, isBefore, format } from 'date-fns'
import { el } from 'date-fns/locale'
import 'react-day-picker/dist/style.css'

// Toast types
interface ToastData {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  message?: string
  duration?: number
}

interface Client {
  firstName: string
  lastName: string
  phoneNumber: string
  email?: string
}

interface Vehicle {
  brand: string
  model: string
  year: number
  licensePlate?: string
  engineCC?: string
  engineNumber?: string
  modelYear?: string
  fuelType?: string
  vinNumber?: string
  is4x4?: boolean
  isAutomatic?: boolean
  isTurbo?: boolean
}

interface ServiceRequest {
  id: string
  description: string
  category: string
  status: string
  createdAt: string
  estimatedCost?: number
  client: Client
  vehicle: Vehicle
  photoUrls?: string[]
}

interface Garage {
  id: string
  companyName: string
  phoneNumber: string
  email: string
  address: string
  benefits?: string[]
}

interface Offer {
  id?: string
  offerNumber?: string
  estimatedCost: number
  offerAmount: number
  status: OfferStatus
  createdAt: string
  benefits: string[]
}

interface OfferPageProps {
  garageId: string
  requestId: string
}

export default function OfferPage({ garageId, requestId }: OfferPageProps) {
  const [serviceRequest, setServiceRequest] = useState<ServiceRequest | null>(null)
  const [garage, setGarage] = useState<Garage | null>(null)
  const [offer, setOffer] = useState<Offer>({
    estimatedCost: 0,
    offerAmount: 0,
    status: OfferStatus.DRAFT,
    createdAt: new Date().toISOString(),
    benefits: []
  })
  const [selectedBenefits, setSelectedBenefits] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [toasts, setToasts] = useState<ToastData[]>([])
  const [existingOffer, setExistingOffer] = useState<any>(null)
  const [originalOffer, setOriginalOffer] = useState<any>(null)
  const [selectedDates, setSelectedDates] = useState<Date[]>([])
  const router = useRouter()

  useEffect(() => {
    loadData()
  }, [garageId, requestId])

  const showToast = (toast: Omit<ToastData, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const newToast: ToastData = { ...toast, id }
    setToasts(prev => [...prev, newToast])
    
    // Auto-dismiss after duration
    setTimeout(() => {
      removeToast(id)
    }, toast.duration || 3000)
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  const loadData = async () => {
    try {
      setIsLoading(true)
      
      // Load service request
      const requestResponse = await fetch(`/api/requests/${requestId}`)
      if (requestResponse.ok) {
        const requestData = await requestResponse.json()
        if (requestData.success) {
          setServiceRequest(requestData.request)
          setOffer(prev => ({
            ...prev,
            estimatedCost: requestData.request.estimatedCost || 0
          }))
        }
      }

      // Load garage data
      const garageResponse = await fetch(`/api/garage/${garageId}`)
      if (garageResponse.ok) {
        const garageData = await garageResponse.json()
        if (garageData.success) {
          setGarage(garageData.garage)
          // Set all benefits as selected by default
          if (garageData.garage.benefits && garageData.garage.benefits.length > 0) {
            setSelectedBenefits(garageData.garage.benefits)
          }
        }
      }

      // Check for existing offers for this request from this garage
      const offersResponse = await fetch(`/api/offers?serviceRequestId=${requestId}&garageId=${garageId}`)
      if (offersResponse.ok) {
        const offersData = await offersResponse.json()
        if (offersData.success && offersData.offers && offersData.offers.length > 0) {
          // Get the most recent offer
          const latestOffer = offersData.offers[0]
          setExistingOffer(latestOffer)
          
          // Pre-fill the form with existing offer data
          const existingOfferData = {
            offerNumber: latestOffer.offerNumber,
            estimatedCost: latestOffer.estimatedCost,
            offerAmount: latestOffer.offerAmount,
            benefits: latestOffer.benefits || []
          }
          
          setOffer(prev => ({
            ...prev,
            ...existingOfferData
          }))
          
          // Store original offer for comparison
          setOriginalOffer({
            offerAmount: latestOffer.offerAmount,
            benefits: latestOffer.benefits || [],
            availabilityDates: latestOffer.availabilityDates || []
          })
          
          // Set selected benefits from existing offer
          if (latestOffer.benefits && latestOffer.benefits.length > 0) {
            setSelectedBenefits(latestOffer.benefits)
          }
          
          // Set selected dates from existing offer
          if (latestOffer.availabilityDates && latestOffer.availabilityDates.length > 0) {
            setSelectedDates(latestOffer.availabilityDates.map((d: string) => new Date(d)))
          }
        }
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const generateOfferNumber = () => {
    const now = new Date()
    const day = now.getDate().toString().padStart(2, '0')
    const month = (now.getMonth() + 1).toString().padStart(2, '0')
    const year = now.getFullYear().toString().slice(-2)
    const randomNum = Math.floor(Math.random() * 9) + 1 // 1-9
    return `Offer_${day}${month}${year}_${randomNum}`
  }

  const handleOfferAmountChange = (value: string) => {
    const amount = parseInt(value) || 0
    setOffer(prev => ({ ...prev, offerAmount: amount }))
  }

  const handleBenefitToggle = (benefit: string) => {
    setSelectedBenefits(prev => 
      prev.includes(benefit) 
        ? prev.filter(b => b !== benefit)
        : [...prev, benefit]
    )
  }

  // Check if offer has been modified
  const hasChanges = () => {
    if (!originalOffer) return true // New offer, always allow submit
    
    // Check if offer amount changed
    if (offer.offerAmount !== originalOffer.offerAmount) return true
    
    // Check if benefits changed
    const currentBenefits = [...selectedBenefits].sort()
    const originalBenefitsArray = [...(originalOffer.benefits || [])].sort()
    
    if (currentBenefits.length !== originalBenefitsArray.length) return true
    
    for (let i = 0; i < currentBenefits.length; i++) {
      if (currentBenefits[i] !== originalBenefitsArray[i]) return true
    }
    
    // Check if availability dates changed
    const currentDates = selectedDates.map(d => format(d, 'yyyy-MM-dd')).sort()
    const originalDates = (originalOffer.availabilityDates || []).sort()
    
    if (currentDates.length !== originalDates.length) return true
    
    for (let i = 0; i < currentDates.length; i++) {
      if (currentDates[i] !== originalDates[i]) return true
    }
    
    return false
  }

  const handleSendOffer = async () => {
    // Validate required fields
    if (offer.offerAmount <= 0) {
      showToast({
        type: 'error',
        title: 'Ατελής Σύμπληρωση',
        message: 'Παρακαλώ συμπληρώστε το πεδίο "Ποσό Προσφοράς"',
        duration: 4000
      })
      return
    }

    if (selectedDates.length === 0) {
      showToast({
        type: 'error',
        title: 'Ατελής Σύμπληρωση',
        message: 'Παρακαλώ επιλέξτε τουλάχιστον μία ημερομηνία διαθεσιμότητας',
        duration: 4000
      })
      return
    }

    try {
      setIsSubmitting(true)
      
      // Check if we're updating an existing offer or creating a new one
      if (existingOffer) {
        // UPDATE existing offer
        const updateData = {
          offerId: existingOffer.id,
          offerAmount: offer.offerAmount,
          benefits: selectedBenefits,
          availabilityDates: selectedDates.map(d => format(d, 'yyyy-MM-dd')),
          status: OfferStatus.PENDING
        }

        const response = await fetch('/api/offers', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateData),
        })

        if (response.ok) {
          const result = await response.json()
          if (result.success) {
            showToast({
              type: 'success',
              title: 'Επιτυχής Ενημέρωση',
              message: 'Η προσφορά σας ενημερώθηκε επιτυχώς!',
              duration: 3000
            })
            // Update original offer state
            setOriginalOffer({
              offerAmount: offer.offerAmount,
              benefits: selectedBenefits,
              availabilityDates: selectedDates.map(d => format(d, 'yyyy-MM-dd'))
            })
            // Navigate after a short delay (keep spinner active)
            setTimeout(() => {
              router.push(`/garage-dashboard/${garageId}#my-offers`)
              setIsSubmitting(false)
            }, 1500)
          } else {
            showToast({
              type: 'error',
              title: 'Σφάλμα Ενημέρωσης',
              message: result.error || 'Δεν ήταν δυνατή η ενημέρωση της προσφοράς',
              duration: 5000
            })
            setIsSubmitting(false)
          }
        } else {
          showToast({
            type: 'error',
            title: 'Σφάλμα Δικτύου',
            message: 'Δεν ήταν δυνατή η σύνδεση με τον διακομιστή',
            duration: 5000
          })
          setIsSubmitting(false)
        }
      } else {
        // CREATE new offer
        const offerData = {
          offerNumber: generateOfferNumber(),
          estimatedCost: offer.estimatedCost,
          offerAmount: offer.offerAmount,
          benefits: selectedBenefits,
          availabilityDates: selectedDates.map(d => format(d, 'yyyy-MM-dd')),
          status: OfferStatus.PENDING,
          serviceRequestId: requestId,
          garageId: garageId
        }

        const response = await fetch('/api/offers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(offerData),
        })

        if (response.ok) {
          const result = await response.json()
          if (result.success) {
            showToast({
              type: 'success',
              title: 'Επιτυχής Αποστολή',
              message: 'Η προσφορά σας στάλθηκε επιτυχώς! Θα ειδοποιηθεί ο πελάτης.',
              duration: 3000
            })
            // Navigate after a short delay (keep spinner active)
            setTimeout(() => {
              router.push(`/garage-dashboard/${garageId}#my-offers`)
              setIsSubmitting(false)
            }, 1500)
          } else {
            showToast({
              type: 'error',
              title: 'Σφάλμα Αποστολής',
              message: result.error || 'Δεν ήταν δυνατή η αποστολή της προσφοράς',
              duration: 5000
            })
            setIsSubmitting(false)
          }
        } else {
          showToast({
            type: 'error',
            title: 'Σφάλμα Δικτύου',
            message: 'Δεν ήταν δυνατή η σύνδεση με τον διακομιστή',
            duration: 5000
          })
          setIsSubmitting(false)
        }
      }
    } catch (error) {
      console.error('Error sending offer:', error)
      showToast({
        type: 'error',
        title: 'Σφάλμα Συστήματος',
        message: 'Παρουσιάστηκε απροσδόκητο σφάλμα. Παρακαλώ δοκιμάστε ξανά.',
        duration: 5000
      })
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className={styles.bodyText}>Φόρτωση...</p>
        </div>
      </div>
    )
  }

  if (!serviceRequest || !garage) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className={`${styles.pageTitle} mb-4`}>Σφάλμα</h2>
          <p className={styles.bodyText}>Δεν ήταν δυνατή η φόρτωση των δεδομένων.</p>
          <Button
            variant="secondary"
            onClick={() => router.push(`/garage-dashboard/${garageId}#available`)}
            className="mt-4"
          >
            Επιστροφή
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className={`${styles.pageTitle} text-3xl text-center`}>
              Προσφορά
            </h1>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* Client Details Section */}
        <Card className="p-6">
          <div className="flex justify-between items-start mb-4">
            <h2 className={`${styles.sectionTitle}`}>Στοιχεία Πελάτη</h2>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push(`/garage-dashboard/${garageId}/chat/${requestId}`)}
              className="flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Συνομιλία
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className={`${styles.bodyText} text-sm`}>
                <span className="text-gray-600">Όνομα:</span> 
                <strong className="ml-2">{serviceRequest.client.firstName} {serviceRequest.client.lastName}</strong>
              </p>
            </div>
            <div>
              <p className={`${styles.bodyText} text-sm`}>
                <span className="text-gray-600">Τηλέφωνο:</span> 
                <strong className="ml-2">{serviceRequest.client.phoneNumber}</strong>
              </p>
            </div>
            {serviceRequest.client.email && (
              <div className="col-span-2">
                <p className={`${styles.bodyText} text-sm`}>
                  <span className="text-gray-600">Email:</span> 
                  <strong className="ml-2">{serviceRequest.client.email}</strong>
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Request Details Section */}
        <ServiceVehicleCard
          serviceDescription={serviceRequest.description}
          category={serviceRequest.category}
          estimatedCost={serviceRequest.estimatedCost}
          vehicle={{
            brand: serviceRequest.vehicle.brand,
            model: serviceRequest.vehicle.model,
            engineCC: serviceRequest.vehicle.engineCC,
            modelYear: serviceRequest.vehicle.modelYear,
            year: serviceRequest.vehicle.year,
            fuelType: serviceRequest.vehicle.fuelType,
            isAutomatic: serviceRequest.vehicle.isAutomatic,
            is4x4: serviceRequest.vehicle.is4x4,
            isTurbo: serviceRequest.vehicle.isTurbo,
            vinNumber: serviceRequest.vehicle.vinNumber,
            engineNumber: serviceRequest.vehicle.engineNumber
          }}
          photoCount={serviceRequest.photoUrls?.length || 0}
          showEstimatedCost={false}
        />

        {/* Offer Section */}
        <Card className="p-6">
          <h2 className={`${styles.sectionTitle} mb-6`}>Προσφορά</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Offer Number */}
            <div>
              <label className={`${styles.bodyText} text-sm text-gray-600 block mb-2`}>
                Αριθμός Προσφοράς
              </label>
              <Input
                value={offer.offerNumber || ''}
                onChange={() => {}}
                placeholder="Θα δημιουργηθεί αυτόματα"
                disabled
                className="bg-gray-100"
              />
            </div>

            {/* Estimated Cost */}
            <div>
              <label className={`${styles.bodyText} text-sm text-gray-600 block mb-2`}>
                Ποσό Εκτίμησης
              </label>
              <Input
                value={String(offer.estimatedCost || 0)}
                onChange={() => {}}
                disabled
                className="bg-gray-100"
              />
            </div>

            {/* Offer Amount */}
            <div>
              <label className={`${styles.bodyText} text-sm text-gray-600 block mb-2`}>
                Ποσό Προσφοράς *
              </label>
              <Input
                type="number"
                value={String(offer.offerAmount || '')}
                onChange={(value) => handleOfferAmountChange(value)}
                placeholder="Εισάγετε το ποσό προσφοράς"
                required
              />
            </div>

            {/* Date */}
            <div>
              <label className={`${styles.bodyText} text-sm text-gray-600 block mb-2`}>
                Ημερομηνία
              </label>
              <Input
                value={new Date().toLocaleDateString('el-GR')}
                onChange={() => {}}
                disabled
                className="bg-gray-100"
              />
            </div>
          </div>
        </Card>

        {/* Availability Calendar Section */}
        <Card className="p-6">
          <h2 className={`${styles.sectionTitle} mb-4`}>Διαθεσιμότητα *</h2>
          <p className={`${styles.bodyText} text-sm text-gray-600 mb-4`}>
            Επιλέξτε τις ημέρες που μπορείτε να δεχτείτε το όχημα (Δευτέρα - Παρασκευή)
          </p>
          
          <div className="flex justify-center">
            <DayPicker
              mode="multiple"
              selected={selectedDates}
              onSelect={(dates) => setSelectedDates(dates || [])}
              locale={el}
              disabled={[
                // Disable past dates and today
                { before: addDays(new Date(), 1) },
                // Disable weekends
                (date) => isWeekend(date),
                // Disable dates beyond 2 weeks
                { after: addWeeks(new Date(), 2) }
              ]}
              fromDate={addDays(new Date(), 1)}
              toDate={addWeeks(new Date(), 2)}
              className="border rounded-lg p-4"
              modifiersClassNames={{
                selected: 'bg-orange-500 text-white hover:bg-orange-600',
                today: 'font-bold text-orange-600'
              }}
              styles={{
                root: { color: '#111111' },
                caption_label: { color: '#111111', fontWeight: 600 },
                nav_button: { color: '#111111' },
                head_cell: { color: '#111111' },
                day: { color: '#111111' },
                day_disabled: { color: '#d1d5db' },
                day_outside: { color: '#d1d5db' }
              }}
            />
          </div>
          
          {/* Selected Dates Summary */}
          {selectedDates.length > 0 && (
            <div className="mt-4 p-4 bg-orange-50 rounded-lg">
              <h4 className={`${styles.label} mb-2`}>Επιλεγμένες Ημερομηνίες ({selectedDates.length}):</h4>
              <div className="flex flex-wrap gap-2">
                {selectedDates
                  .sort((a, b) => a.getTime() - b.getTime())
                  .map((date, index) => (
                    <span 
                      key={index} 
                      className="px-3 py-1 bg-orange-500 text-white rounded-full text-sm"
                    >
                      {format(date, 'dd/MM/yyyy (EEEE)', { locale: el })}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </Card>

        {/* Garage Benefits Section */}
        {garage.benefits && garage.benefits.length > 0 && (
          <Card className="p-6">
            <h2 className={`${styles.sectionTitle} mb-4`}>Παροχές Εργασίας</h2>
            <h3 className={`${styles.sectionTitle} text-lg mb-4`}>Δωρεάν Παροχές</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {garage.benefits.map((benefit, index) => (
                <div key={index} className="flex items-center">
                  <Checkbox
                    checked={selectedBenefits.includes(benefit)}
                    onChange={() => handleBenefitToggle(benefit)}
                    className="mr-3"
                  />
                  <span className={styles.bodyText}>{benefit}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Status and Actions */}
        <Card className="p-6">
          <h2 className={`${styles.sectionTitle} mb-4`}>Κατάσταση</h2>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className={`${styles.bodyText} text-sm text-gray-600`}>Status:</span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                offer.status === OfferStatus.DRAFT 
                  ? 'bg-yellow-100 text-yellow-800' 
                  : 'bg-blue-100 text-blue-800'
              }`}>
                {offer.status === OfferStatus.DRAFT ? 'Draft' : 'Pending'}
              </span>
            </div>
            
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => router.push(`/garage-dashboard/${garageId}#available`)}
              >
                Ακύρωση
              </Button>
              <Button
                variant="primary"
                onClick={handleSendOffer}
                disabled={isSubmitting || (existingOffer && !hasChanges())}
                loading={isSubmitting}
              >
                {existingOffer ? 'Ενημέρωση Προσφοράς' : 'Αποστολή Προσφοράς'}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Toast Notifications */}
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50
            w-[90%] max-w-md
            ${toast.type === 'success' ? 'bg-green-50 border-green-200' : ''}
            ${toast.type === 'error' ? 'bg-red-50 border-red-200' : ''}
            ${toast.type === 'warning' ? 'bg-yellow-50 border-yellow-200' : ''}
            ${toast.type === 'info' ? 'bg-blue-50 border-blue-200' : ''}
            border rounded-lg shadow-lg
            transition-all duration-300 ease-in-out
            translate-y-0 opacity-100
          `}
        >
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {toast.type === 'success' && (
                  <svg className="h-5 w-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
                {toast.type === 'error' && (
                  <svg className="h-5 w-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                )}
                {toast.type === 'warning' && (
                  <svg className="h-5 w-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                )}
                {toast.type === 'info' && (
                  <svg className="h-5 w-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-gray-900">
                  {toast.title}
                </h4>
                {toast.message && (
                  <p className="mt-1 text-sm text-gray-600">
                    {toast.message}
                  </p>
                )}
              </div>
              
              <button
                onClick={() => removeToast(toast.id)}
                className="flex-shrink-0 ml-2 p-1 rounded-md hover:bg-gray-100 transition-colors"
              >
                <svg className="h-4 w-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
