'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ServiceVehicleCard } from '@/components'
import { styles } from '@/styles/styles'
import { OfferStatus } from '@/types/statuses'
import Icon from '@/components/ui/Icon'
import { DayPicker } from 'react-day-picker'
import { addDays, addMonths, isWeekend, startOfDay, isBefore, format } from 'date-fns'
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
  const [clientAvailabilityDates, setClientAvailabilityDates] = useState<string[]>([])
  const [addingClientDate, setAddingClientDate] = useState<string | null>(null)
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

          // Set client availability dates if any
          if (latestOffer.clientAvailabilityDates && latestOffer.clientAvailabilityDates.length > 0) {
            setClientAvailabilityDates(latestOffer.clientAvailabilityDates)
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

  const handleAddClientDateToAvailability = async (dateStr: string) => {
    // Check if already in selectedDates
    const dateObj = new Date(`${dateStr}T00:00:00`)
    const alreadySelected = selectedDates.some(d => format(d, 'yyyy-MM-dd') === dateStr)
    if (alreadySelected) return

    setAddingClientDate(dateStr)

    // Add to local state
    const newSelectedDates = [...selectedDates, dateObj]
    setSelectedDates(newSelectedDates)

    // Auto-save to API
    if (existingOffer) {
      try {
        const updateData = {
          offerId: existingOffer.id,
          offerAmount: offer.offerAmount,
          benefits: selectedBenefits,
          availabilityDates: newSelectedDates.map(d => format(d, 'yyyy-MM-dd')),
          status: OfferStatus.PENDING
        }

        const response = await fetch('/api/offers', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData),
        })

        if (response.ok) {
          const result = await response.json()
          if (result.success) {
            setOriginalOffer({
              offerAmount: offer.offerAmount,
              benefits: selectedBenefits,
              availabilityDates: newSelectedDates.map(d => format(d, 'yyyy-MM-dd'))
            })
            showToast({
              type: 'success',
              title: 'Ημερομηνία προστέθηκε',
              message: 'Η ημερομηνία προστέθηκε στη διαθεσιμότητά σας.',
              duration: 2000
            })
          }
        }
      } catch (error) {
        console.error('Error updating availability:', error)
        // Revert on error
        setSelectedDates(prev => prev.filter(d => format(d, 'yyyy-MM-dd') !== dateStr))
      }
    }

    setAddingClientDate(null)
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

  const isAccepted = existingOffer?.status === OfferStatus.ACCEPTED

  if (isLoading) {
    return (
      <div className={styles.pageCenter}>
        <div className="text-center">
          <div className={styles.loadingSpinner}></div>
          <p className={styles.bodyText}>Φόρτωση...</p>
        </div>
      </div>
    )
  }

  if (!serviceRequest || !garage) {
    return (
      <div className={styles.pageCenter}>
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mx-auto mb-4">
            <Icon name="error" size="lg" className="text-tertiary" />
          </div>
          <h2 className={`${styles.sectionTitle} mb-2`}>Σφάλμα</h2>
          <p className={`${styles.bodyText} mb-6`}>Δεν ήταν δυνατή η φόρτωση των δεδομένων.</p>
          <button
            onClick={() => router.push(`/garage-dashboard/${garageId}#available`)}
            className={styles.btnOutline}
          >
            <Icon name="arrow_back" size="sm" />
            Επιστροφή
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.pageWrapper}>
      {/* Header */}
      <div className="bg-surface-container-lowest border-b border-outline-variant/10 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-5 md:px-8">
          <div className="flex items-center gap-4 py-4">
            <button
              onClick={() => router.push(`/garage-dashboard/${garageId}#available`)}
              className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center hover:bg-surface-container-highest transition-colors"
            >
              <Icon name="arrow_back" size="sm" className="text-on-surface" />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-on-surface">
                {existingOffer ? 'Ενημέρωση Προσφοράς' : 'Νέα Προσφορά'}
              </h1>
              <p className="text-xs text-secondary">
                {serviceRequest.vehicle.brand} {serviceRequest.vehicle.model} -- {serviceRequest.client.firstName} {serviceRequest.client.lastName}
              </p>
            </div>
            {!isAccepted && (
              <button
                onClick={() => router.push(`/garage-dashboard/${garageId}/chat/${requestId}`)}
                className="w-10 h-10 rounded-full machined-gradient flex items-center justify-center shadow-lg shadow-primary/20 active:scale-95 transition-transform"
              >
                <Icon name="chat" size="sm" className="text-on-primary" filled />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-3xl mx-auto px-5 md:px-8 py-6 space-y-5">

        {/* Client Details Section */}
        <div className={styles.card}>
          <p className={`${styles.labelUpper} mb-4`}>Στοιχεία Πελάτη</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0">
                <Icon name="person" size="sm" className="text-primary" filled />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">Ονοματεπώνυμο</p>
                <p className="text-sm font-bold text-on-surface">{serviceRequest.client.firstName} {serviceRequest.client.lastName}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0">
                <Icon name="call" size="sm" className="text-primary" filled />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">Τηλέφωνο</p>
                <p className="text-sm font-bold text-on-surface">{serviceRequest.client.phoneNumber}</p>
              </div>
            </div>
            {serviceRequest.client.email && (
              <div className="flex items-center gap-3 sm:col-span-2">
                <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0">
                  <Icon name="mail" size="sm" className="text-primary" filled />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">Email</p>
                  <p className="text-sm font-bold text-on-surface">{serviceRequest.client.email}</p>
                </div>
              </div>
            )}
          </div>
        </div>

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
        <div className={styles.card}>
          <div className="flex items-center gap-2 mb-5">
            <Icon name="request_quote" size="md" className="text-primary" filled />
            <p className={styles.labelUpper}>Προσφορά</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Offer Number */}
            <div>
              <label className={`${styles.label} mb-2 block`}>Αριθμός Προσφοράς</label>
              <input
                value={offer.offerNumber || 'Αυτόματα'}
                readOnly
                className={`${styles.input} !bg-surface-container !text-secondary`}
              />
            </div>

            {/* Estimated Cost */}
            <div>
              <label className={`${styles.label} mb-2 block`}>Ποσό Εκτίμησης</label>
              <input
                value={`${offer.estimatedCost || 0} EUR`}
                readOnly
                className={`${styles.input} !bg-surface-container !text-secondary`}
              />
            </div>

            {/* Offer Amount */}
            <div>
              <label className={`${styles.label} mb-2 block`}>
                Ποσό Προσφοράς <span className="text-tertiary">*</span>
              </label>
              <input
                type="number"
                value={offer.offerAmount || ''}
                onChange={(e) => handleOfferAmountChange(e.target.value)}
                placeholder="Εισάγετε ποσό"
                className={styles.input}
                required
                disabled={isAccepted}
              />
            </div>

            {/* Date */}
            <div>
              <label className={`${styles.label} mb-2 block`}>Ημερομηνία</label>
              <input
                value={new Date().toLocaleDateString('el-GR')}
                readOnly
                className={`${styles.input} !bg-surface-container !text-secondary`}
              />
            </div>
          </div>
        </div>

        {/* Availability Calendar Section */}
        <div className={styles.card}>
          <div className="flex items-center gap-2 mb-2">
            <Icon name="calendar_month" size="md" className="text-primary" filled />
            <p className={styles.labelUpper}>
              Διαθεσιμότητα <span className="text-tertiary">*</span>
            </p>
          </div>
          <p className="text-xs text-secondary mb-5">
            Επιλέξτε τις ημέρες που μπορείτε να δεχτείτε το όχημα (Δευτέρα - Παρασκευή, έως 2 μήνες)
          </p>

          <div className={`flex justify-center ${isAccepted ? 'opacity-50 pointer-events-none' : ''}`}>
            <DayPicker
              mode="multiple"
              selected={selectedDates}
              onSelect={isAccepted ? undefined : (dates) => setSelectedDates(dates || [])}
              locale={el}
              disabled={[
                { before: addDays(new Date(), 1) },
                (date) => isWeekend(date),
                { after: addMonths(new Date(), 2) }
              ]}
              fromDate={addDays(new Date(), 1)}
              toDate={addMonths(new Date(), 2)}
              className="border border-outline-variant/20 rounded-xl p-4 bg-surface-container-lowest"
              modifiersClassNames={{
                selected: '!bg-primary !text-on-primary hover:!bg-primary/90 !rounded-lg',
                today: '!font-bold !text-primary'
              }}
              styles={{
                root: { color: '#1b1c1c' },
                caption_label: { color: '#1b1c1c', fontWeight: 700 },
                nav_button: { color: '#8a5100' },
                head_cell: { color: '#554434', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' as const },
                day: { color: '#1b1c1c', borderRadius: '8px' },
                day_disabled: { color: '#e4e2e1' },
                day_outside: { color: '#e4e2e1' }
              }}
            />
          </div>

          {/* Selected Dates Summary */}
          {selectedDates.length > 0 && (
            <div className="mt-5 p-4 bg-surface-container-low rounded-xl">
              <p className={`${styles.labelUpper} mb-3`}>Επιλεγμένες Ημερομηνίες ({selectedDates.length})</p>
              <div className="flex flex-wrap gap-2">
                {selectedDates
                  .sort((a, b) => a.getTime() - b.getTime())
                  .map((date, index) => (
                    <span
                      key={index}
                      className="px-3 py-1.5 machined-gradient text-on-primary rounded-full text-xs font-bold"
                    >
                      {format(date, 'dd/MM/yyyy (EEEE)', { locale: el })}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Client Proposed Dates Section */}
        {clientAvailabilityDates.length > 0 && !isAccepted && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Icon name="event_note" filled size="sm" className="text-amber-700" />
              </div>
              <div>
                <p className="text-sm font-bold text-amber-900">Ο πελάτης πρότεινε νέες ημερομηνίες</p>
                <p className="text-xs text-amber-700">Οι ημερομηνίες που δηλώσατε δεν τον εξυπηρετούν. Προτείνει τις παρακάτω:</p>
              </div>
            </div>
            <p className="text-xs text-amber-700 mb-2">Πατήστε σε όσες ημερομηνίες σας εξυπηρετούν ώστε να διαλέξει τελικά μία ο πελάτης:</p>
            <div className="flex flex-wrap gap-2">
              {clientAvailabilityDates
                .slice()
                .sort()
                .map((date) => {
                  const alreadyAdded = selectedDates.some(d => format(d, 'yyyy-MM-dd') === date)
                  const isAdding = addingClientDate === date

                  return (
                    <button
                      key={date}
                      type="button"
                      disabled={alreadyAdded || isAdding}
                      onClick={() => handleAddClientDateToAvailability(date)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 flex items-center gap-1.5 ${
                        alreadyAdded
                          ? 'bg-green-100 border border-green-300 text-green-800 cursor-default'
                          : isAdding
                            ? 'bg-amber-200 border border-amber-400 text-amber-900 cursor-wait'
                            : 'bg-amber-100 border border-amber-300 text-amber-900 hover:bg-primary/10 hover:border-primary/30 hover:text-primary cursor-pointer'
                      }`}
                    >
                      <Icon
                        name={alreadyAdded ? 'check_circle' : isAdding ? 'hourglass_top' : 'add_circle'}
                        size="sm"
                        filled={alreadyAdded}
                        className={alreadyAdded ? 'text-green-600' : isAdding ? 'text-amber-700' : 'text-amber-700'}
                      />
                      {new Date(`${date}T00:00:00`).toLocaleDateString('el-GR', {
                        weekday: 'long',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                      })}
                      {alreadyAdded && <span className="text-[9px] uppercase tracking-wider">Προστέθηκε</span>}
                    </button>
                  )
                })}
            </div>
          </div>
        )}

        {/* Garage Benefits Section */}
        {garage.benefits && garage.benefits.length > 0 && (
          <div className={styles.card}>
            <div className="flex items-center gap-2 mb-2">
              <Icon name="volunteer_activism" size="md" className="text-primary" filled />
              <p className={styles.labelUpper}>Παροχές Εργασίας</p>
            </div>
            <p className="text-xs text-secondary mb-5">Δωρεάν Παροχές</p>

            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${isAccepted ? 'pointer-events-none opacity-60' : ''}`}>
              {garage.benefits.map((benefit, index) => (
                <label
                  key={index}
                  className={`flex items-center gap-3 p-3 rounded-xl ${isAccepted ? 'cursor-default' : 'cursor-pointer'} transition-all ${
                    selectedBenefits.includes(benefit)
                      ? 'bg-primary/5 border border-primary/20'
                      : 'bg-surface-container border border-transparent'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    selectedBenefits.includes(benefit)
                      ? 'bg-primary border-primary'
                      : 'border-outline bg-transparent'
                  }`}>
                    {selectedBenefits.includes(benefit) && (
                      <Icon name="check" size="sm" className="text-on-primary !text-xs" />
                    )}
                  </div>
                  <span className="text-sm font-medium text-on-surface">{benefit}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Status and Actions */}
        <div className={styles.card}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className={styles.labelUpper}>Κατάσταση</p>
              <span className={`text-[10px] font-black uppercase tracking-[0.1em] px-3 py-1 rounded-full ${
                isAccepted
                  ? 'bg-green-100 text-green-700'
                  : offer.status === OfferStatus.DRAFT
                    ? 'bg-primary/10 text-primary'
                    : 'bg-blue-100 text-blue-700'
              }`}>
                {isAccepted ? 'Αποδεκτή' : offer.status === OfferStatus.DRAFT ? 'Draft' : 'Pending'}
              </span>
            </div>
          </div>

          {isAccepted ? (
            <div className="mt-4 p-4 bg-green-50 border border-green-100 rounded-xl flex items-start gap-3">
              <Icon name="check_circle" filled size="md" className="text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-green-900">Η προσφορά έχει γίνει αποδεκτή</p>
                <p className="text-xs text-green-700">Ο πελάτης αποδέχτηκε την προσφορά σας. Το ραντεβού έχει προγραμματιστεί.</p>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => router.push(`/garage-dashboard/${garageId}#available`)}
                className={`${styles.btnOutline} flex-1 justify-center`}
              >
                Ακύρωση
              </button>
              <button
                onClick={handleSendOffer}
                disabled={isSubmitting || (existingOffer && !hasChanges())}
                className={`${
                  isSubmitting || (existingOffer && !hasChanges())
                    ? styles.btnDisabled
                    : styles.btnPrimary
                } flex-1 justify-center`}
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />
                ) : (
                  <>
                    <Icon name={existingOffer ? 'sync' : 'send'} size="sm" />
                    {existingOffer ? 'Ενημέρωση Προσφοράς' : 'Αποστολή Προσφοράς'}
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Toast Notifications */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[90%] max-w-md">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`
              bg-surface-container-lowest rounded-xl shadow-xl border border-outline-variant/10
              transition-all duration-300 ease-in-out animate-in slide-in-from-bottom
            `}
          >
            <div className="p-4 flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {toast.type === 'success' && (
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                    <Icon name="check_circle" size="sm" className="text-green-600" filled />
                  </div>
                )}
                {toast.type === 'error' && (
                  <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                    <Icon name="error" size="sm" className="text-red-600" filled />
                  </div>
                )}
                {toast.type === 'warning' && (
                  <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center">
                    <Icon name="warning" size="sm" className="text-yellow-600" filled />
                  </div>
                )}
                {toast.type === 'info' && (
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <Icon name="info" size="sm" className="text-blue-600" filled />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-on-surface">
                  {toast.title}
                </h4>
                {toast.message && (
                  <p className="mt-0.5 text-xs text-secondary">
                    {toast.message}
                  </p>
                )}
              </div>

              <button
                onClick={() => removeToast(toast.id)}
                className="flex-shrink-0 w-7 h-7 rounded-full hover:bg-surface-container flex items-center justify-center transition-colors"
              >
                <Icon name="close" size="sm" className="text-secondary" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
