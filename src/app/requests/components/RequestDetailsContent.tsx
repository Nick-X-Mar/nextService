'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Icon from '@/components/ui/Icon'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'
import { addDays, addMonths, format, isWeekend } from 'date-fns'
import { el } from 'date-fns/locale'
import { ServiceVehicleCard, Modal, Input, Button, Checkbox } from '@/components'
import PaymentModal from './PaymentModal'
import { styles } from '../../../styles/styles'
import { ServiceRequestStatus, OfferStatus } from '../../../types/statuses'
import type { ServiceRequest } from '../../../types/requests'
import type { SavedCard } from '@/types/payments'

interface Offer {
  id: string
  offerAmount: number
  estimatedCost?: number
  availabilityDates?: string[]
  garageId?: string
  offerNumber?: string
  status?: OfferStatus
  createdAt?: string
  updatedAt?: string
  clientAvailabilityDates?: string[]
  appointmentDate?: string
  appointmentPrice?: number
  benefits?: string[]
}

interface GarageSummary {
  id: string
  companyName?: string
  address?: string
  benefits?: string[] | null
}

interface OfferWithGarage extends Offer {
  garage?: GarageSummary | null
}

type VehicleInfo = ServiceRequest['vehicle'] | null

interface VehicleFormState {
  brand: string
  model: string
  engineCC: string
  modelYear: string
  fuelType: string
  isAutomatic: 'true' | 'false'
  is4x4: 'true' | 'false'
  isTurbo: 'true' | 'false'
  vinNumber: string
  engineNumber: string
}

const fuelTypeOptions = [
  { value: '', label: 'Επιλέξτε καύσιμο' },
  { value: 'petrol', label: 'Βενζίνη' },
  { value: 'diesel', label: 'Πετρέλαιο' },
  { value: 'hybrid', label: 'Υβριδικό' },
  { value: 'electric', label: 'Ηλεκτρικό' },
  { value: 'lpg', label: 'Υγραέριο (LPG)' },
  { value: 'cng', label: 'Φυσικό Αέριο (CNG)' }
]

const booleanToSelectValue = (value?: boolean | string | null): 'true' | 'false' => {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', 'yes', '1', 'nai'].includes(normalized)) return 'true'
    if (['false', 'no', '0', 'oxi', 'όχι'].includes(normalized)) return 'false'
  }
  return 'false'
}

const sanitizeEngineValue = (value?: string | number | null) => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return value.toString()
  return value.replace(/cc/i, '').trim()
}

const createVehicleFormState = (vehicle: VehicleInfo): VehicleFormState => ({
  brand: vehicle?.brand ?? '',
  model: vehicle?.model ?? '',
  engineCC: sanitizeEngineValue(vehicle?.engineCC),
  modelYear: vehicle?.modelYear?.toString() ?? '',
  fuelType: vehicle?.fuelType ?? '',
  isAutomatic: booleanToSelectValue(vehicle?.isAutomatic),
  is4x4: booleanToSelectValue(vehicle?.is4x4),
  isTurbo: booleanToSelectValue(vehicle?.isTurbo),
  vinNumber: vehicle?.vinNumber ?? '',
  engineNumber: vehicle?.engineNumber ?? ''
})

const mapVehicleDetailsFromApi = (vehicle: unknown): VehicleInfo => {
  if (!vehicle || typeof vehicle !== 'object') {
    return null
  }

  const v = vehicle as Record<string, unknown>
  return {
    brand: (v.brand as string) ?? '',
    model: (v.model as string) ?? '',
    engineCC: (v.engineCC as string) ?? '',
    modelYear: (v.modelYear as string) ?? '',
    fuelType: (v.fuelType as string) ?? '',
    isAutomatic: (v.isAutomatic as boolean | undefined) ?? undefined,
    is4x4: (v.is4x4 as boolean | undefined) ?? undefined,
    isTurbo: (v.isTurbo as boolean | undefined) ?? undefined,
    vinNumber: (v.vinNumber as string) ?? '',
    engineNumber: (v.engineNumber as string) ?? ''
  }
}

interface RequestDetailsContentProps {
  request: ServiceRequest
  onRequestUpdate?: (request: ServiceRequest) => void
  getStatusIcon: (status: ServiceRequestStatus) => React.ReactNode
  getStatusText: (status: ServiceRequestStatus) => string
  getStatusColor: (status: ServiceRequestStatus) => string
}

export default function RequestDetailsContent({
  request,
  onRequestUpdate,
  getStatusIcon,
  getStatusText,
  getStatusColor
}: RequestDetailsContentProps) {
  const [vehicleDetails, setVehicleDetails] = useState<VehicleInfo>(() =>
    mapVehicleDetailsFromApi(request.vehicle)
  )
  const [vehicleForm, setVehicleForm] = useState<VehicleFormState>(() =>
    createVehicleFormState(mapVehicleDetailsFromApi(request.vehicle))
  )
  const [offers, setOffers] = useState<OfferWithGarage[]>([])
  const [offersLoading, setOffersLoading] = useState(true)
  const [offersError, setOffersError] = useState<string | null>(null)
  const [expandedOfferId, setExpandedOfferId] = useState<string | null>(null)
  const [selectedOfferDates, setSelectedOfferDates] = useState<Record<string, string | null>>({})
  const [customPickerOpen, setCustomPickerOpen] = useState<Record<string, boolean>>({})
  const [customDatesByOffer, setCustomDatesByOffer] = useState<Record<string, Date[]>>({})
  const [customDateErrors, setCustomDateErrors] = useState<Record<string, string | null>>({})
  const [customDateSuccesses, setCustomDateSuccesses] = useState<Record<string, string | null>>({})
  const [savingCustomDates, setSavingCustomDates] = useState<Record<string, boolean>>({})
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false)
  const [vehicleFormError, setVehicleFormError] = useState<string | null>(null)
  const [vehicleFormSaving, setVehicleFormSaving] = useState(false)
  const [vehicleUpdateMessage, setVehicleUpdateMessage] = useState<string | null>(null)
  const [vehicleUpdateError, setVehicleUpdateError] = useState<string | null>(null)
  const [acceptingOfferId, setAcceptingOfferId] = useState<string | null>(null)
  const [acceptError, setAcceptError] = useState<string | null>(null)

  // Payment state
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(null)
  const [paymentSavedCards, setPaymentSavedCards] = useState<SavedCard[]>([])
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [pendingOffer, setPendingOffer] = useState<OfferWithGarage | null>(null)
  const [paymentAmounts, setPaymentAmounts] = useState<{ deposit: number; remaining: number } | null>(null)

  const hasOffers =
    typeof offers !== 'undefined' && Array.isArray(offers) && offers.length > 0
  const showWaitingForResponsesBanner = request.status === ServiceRequestStatus.PENDING && !hasOffers

  const formatAvailabilityDate = (dateString: string) => {
    const date = new Date(`${dateString}T00:00:00`)
    const formatted = date.toLocaleDateString('el-GR', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })

    return formatted.charAt(0).toUpperCase() + formatted.slice(1)
  }

  const formatCurrency = (value?: number | string | null) => {
    if (value === null || value === undefined || value === '') {
      return '-'
    }

    const numericValue = typeof value === 'string' ? Number(value) : value

    if (Number.isNaN(numericValue)) {
      return '-'
    }

    return new Intl.NumberFormat('el-GR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(numericValue)
  }

  const getGarageAreaText = (address?: string | null) => {
    if (!address) {
      return 'Δεν έχει δηλωθεί'
    }

    const parts = address.split(',').map((part) => part.trim()).filter(Boolean)
    if (parts.length === 0) {
      return address
    }

    return parts[parts.length - 1]
  }

  const parseDateString = (dateString: string): Date | null => {
    const date = new Date(`${dateString}T00:00:00`)
    return Number.isNaN(date.getTime()) ? null : date
  }

  const formatCustomDateLabel = (date: Date) =>
    format(date, 'dd/MM/yyyy (EEEE)', { locale: el })

  const handleOfferCardClick = (offerId: string) => {
    setExpandedOfferId((prev) => (prev === offerId ? null : offerId))
  }

  const handleSelectOfferDate = (offerId: string, date: string) => {
    setSelectedOfferDates((prev) => ({
      ...prev,
      [offerId]: date
    }))
  }

  const handleToggleCustomPicker = (offerId: string) => {
    setCustomPickerOpen((prev) => {
      const isCurrentlyOpen = !!prev[offerId]
      const next = { ...prev, [offerId]: !isCurrentlyOpen }

      if (!isCurrentlyOpen) {
        const offer = offers.find((item) => item.id === offerId)
        const parsedDates = (offer?.clientAvailabilityDates || [])
          .map(parseDateString)
          .filter((date): date is Date => date !== null)

        setCustomDatesByOffer((prevDates) => ({
          ...prevDates,
          [offerId]: parsedDates
        }))
      }

      return next
    })

    setCustomDateErrors((prev) => ({
      ...prev,
      [offerId]: null
    }))

    setCustomDateSuccesses((prev) => ({
      ...prev,
      [offerId]: null
    }))
  }

  const handleCustomDateSelect = (offerId: string, dates?: Date[]) => {
    if (!dates) {
      setCustomDatesByOffer((prev) => ({
        ...prev,
        [offerId]: []
      }))
      setCustomDateErrors((prev) => ({
        ...prev,
        [offerId]: null
      }))
      setCustomDateSuccesses((prev) => ({
        ...prev,
        [offerId]: null
      }))
      return
    }

    if (dates.length > 5) {
      setCustomDateErrors((prev) => ({
        ...prev,
        [offerId]: 'Μπορείτε να επιλέξετε έως 5 ημερομηνίες.'
      }))
      return
    }

    setCustomDateErrors((prev) => ({
      ...prev,
      [offerId]: null
    }))
    setCustomDateSuccesses((prev) => ({
      ...prev,
      [offerId]: null
    }))
    setCustomDatesByOffer((prev) => ({
      ...prev,
      [offerId]: dates
    }))
  }

  const handleClearCustomDates = (offerId: string) => {
    setCustomDatesByOffer((prev) => ({
      ...prev,
      [offerId]: []
    }))
    setCustomDateErrors((prev) => ({
      ...prev,
      [offerId]: null
    }))
    setCustomDateSuccesses((prev) => ({
      ...prev,
      [offerId]: null
    }))
  }

  const handleSaveCustomDates = async (offer: OfferWithGarage) => {
    const selectedDates = customDatesByOffer[offer.id] || []

    if (selectedDates.length === 0) {
      setCustomDateErrors((prev) => ({
        ...prev,
        [offer.id]: 'Επιλέξτε τουλάχιστον μία ημερομηνία για να συνεχίσετε.'
      }))
      return
    }

    const payload = {
      clientAvailabilityDates: selectedDates.map((date) => format(date, 'yyyy-MM-dd'))
    }

    try {
      setSavingCustomDates((prev) => ({
        ...prev,
        [offer.id]: true
      }))
      setCustomDateErrors((prev) => ({
        ...prev,
        [offer.id]: null
      }))
      setCustomDateSuccesses((prev) => ({
        ...prev,
        [offer.id]: null
      }))

      const response = await fetch(`/api/offers/${offer.id}/client-availability`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        const errorMessage =
          data?.error ||
          'Δεν ήταν δυνατή η αποστολή των ημερομηνιών. Δοκιμάστε ξανά.'
        setCustomDateErrors((prev) => ({
          ...prev,
          [offer.id]: errorMessage
        }))
        return
      }

      const updatedDates: string[] = data.offer?.clientAvailabilityDates || payload.clientAvailabilityDates

      setOffers((prev) =>
        prev.map((item) =>
          item.id === offer.id
            ? { ...item, clientAvailabilityDates: updatedDates }
            : item
        )
      )

      const parsedDates = updatedDates
        .map(parseDateString)
        .filter((date): date is Date => date !== null)

      setCustomDatesByOffer((prev) => ({
        ...prev,
        [offer.id]: parsedDates
      }))

      setCustomDateSuccesses((prev) => ({
        ...prev,
        [offer.id]: 'Οι ημερομηνίες στάλθηκαν με επιτυχία στο συνεργείο.'
      }))
    } catch (error) {
      console.error('Error saving client availability dates:', error)
      setCustomDateErrors((prev) => ({
        ...prev,
        [offer.id]: 'Δεν ήταν δυνατή η αποστολή των ημερομηνιών. Δοκιμάστε ξανά.'
      }))
    } finally {
      setSavingCustomDates((prev) => ({
        ...prev,
        [offer.id]: false
      }))
    }
  }

  const paymentsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true'

  const executeAcceptOffer = async (offer: OfferWithGarage, paymentIntentId?: string) => {
    const selectedDate = selectedOfferDates[offer.id]

    try {
      setAcceptError(null)
      setAcceptingOfferId(offer.id)

      const payload: Record<string, unknown> = {
        offerId: offer.id,
        appointmentDate: selectedDate,
        appointmentPrice: offer.offerAmount
      }
      if (paymentIntentId) {
        payload.paymentIntentId = paymentIntentId
      }

      const response = await fetch(`/api/requests/${request.id}/accept-offer`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        const errorMessage =
          data?.error || 'Δεν ήταν δυνατή η αποδοχή της προσφοράς. Δοκιμάστε ξανά.'
        setAcceptError(errorMessage)
        return
      }

      const updatedRequest: ServiceRequest = {
        ...request,
        status: ServiceRequestStatus.APPOINTMENT,
        acceptedOfferId: offer.id,
        appointmentDate: selectedDate ?? undefined,
        appointmentPrice: offer.offerAmount,
        updatedAt: data.request?.updatedAt ?? new Date().toISOString()
      }

      setOffers((prev) =>
        prev.map((item) =>
          item.id === offer.id
            ? {
                ...item,
                status: OfferStatus.ACCEPTED,
                appointmentDate: selectedDate ?? undefined,
                appointmentPrice: offer.offerAmount
              }
            : {
                ...item,
                status: OfferStatus.REJECTED
              }
        )
      )

      if (onRequestUpdate) {
        onRequestUpdate(updatedRequest)
      }
    } catch (error) {
      console.error('Error accepting offer:', error)
      setAcceptError('Παρουσιάστηκε σφάλμα κατά την αποδοχή της προσφοράς. Δοκιμάστε ξανά.')
    } finally {
      setAcceptingOfferId(null)
    }
  }

  const handleAcceptOffer = async (offer: OfferWithGarage) => {
    const selectedDate = selectedOfferDates[offer.id]

    if (!selectedDate) {
      setAcceptError('Επιλέξτε ημερομηνία για το ραντεβού πριν αποδεχτείτε την προσφορά.')
      return
    }

    if (paymentsEnabled) {
      // Open payment modal
      setPendingOffer(offer)
      setPaymentLoading(true)
      setPaymentError(null)
      setShowPaymentModal(true)

      try {
        const clientId = localStorage.getItem('clientId')
        const res = await fetch('/api/payments/create-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId,
            requestId: request.id,
            offerId: offer.id,
            offerAmount: offer.offerAmount,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Payment setup failed')

        setPaymentClientSecret(data.clientSecret)
        setPaymentSavedCards(data.savedCards || [])
        setPaymentAmounts({ deposit: data.depositAmount, remaining: data.remainingAmount })
      } catch (err) {
        setPaymentError(err instanceof Error ? err.message : 'Σφάλμα πληρωμής')
      } finally {
        setPaymentLoading(false)
      }
    } else {
      // Direct accept (no payment)
      await executeAcceptOffer(offer)
    }
  }

  const handlePaymentSuccess = async (paymentIntentId: string) => {
    setShowPaymentModal(false)
    if (pendingOffer) {
      await executeAcceptOffer(pendingOffer, paymentIntentId)
      setPendingOffer(null)
    }
  }

  const handlePaymentModalClose = () => {
    setShowPaymentModal(false)
    setPendingOffer(null)
    setPaymentClientSecret(null)
    setPaymentAmounts(null)
  }

  useEffect(() => {
    let isMounted = true

    const loadOffers = async () => {
      setOffersLoading(true)
      setOffersError(null)

      try {
        const response = await fetch(`/api/offers?serviceRequestId=${request.id}`)

        if (!response.ok) {
          throw new Error('Failed to fetch offers')
        }

        const data = await response.json()
        const offersData: Offer[] = Array.isArray(data.offers) ? data.offers : []
        const garageCache = new Map<string, GarageSummary | null>()

        const offersWithGarage = await Promise.all(
          offersData.map(async (offer) => {
            if (!offer.garageId) {
              return { ...offer, garage: null }
            }

            if (garageCache.has(offer.garageId)) {
              return { ...offer, garage: garageCache.get(offer.garageId) ?? null }
            }

            try {
              const garageResponse = await fetch(`/api/garage/${offer.garageId}`)

              if (!garageResponse.ok) {
                garageCache.set(offer.garageId, null)
                return { ...offer, garage: null }
              }

              const garageData = await garageResponse.json()
              const normalizedBenefits = Array.isArray(garageData?.garage?.benefits)
                ? garageData?.garage?.benefits
                    .map((benefit: unknown) => (typeof benefit === 'string' ? benefit.trim() : ''))
                    .filter((benefit: string): benefit is string => benefit.length > 0)
                : []

              const garageSummary: GarageSummary = {
                id: garageData?.garage?.id ?? offer.garageId,
                companyName: garageData?.garage?.companyName,
                address: garageData?.garage?.address,
                benefits: normalizedBenefits
              }

              garageCache.set(offer.garageId, garageSummary)
              return { ...offer, garage: garageSummary }
            } catch {
              garageCache.set(offer.garageId, null)
              return { ...offer, garage: null }
            }
          })
        )

        const sortedOffers = offersWithGarage.sort((a, b) => {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0
          return timeA - timeB
        })

        if (isMounted) {
          setOffers(sortedOffers)
          setExpandedOfferId((prev) => {
            if (prev && sortedOffers.some((offer) => offer.id === prev)) {
              return prev
            }
            return sortedOffers[0]?.id ?? null
          })
          setSelectedOfferDates(() => {
            const next: Record<string, string | null> = {}
            sortedOffers.forEach((offer) => {
              next[offer.id] = null
            })
            return next
          })
          setCustomPickerOpen(() => {
            const next: Record<string, boolean> = {}
            sortedOffers.forEach((offer) => {
              next[offer.id] = false
            })
            return next
          })
          setCustomDatesByOffer(() => {
            const next: Record<string, Date[]> = {}
            sortedOffers.forEach((offer) => {
              const parsedDates = (offer.clientAvailabilityDates || [])
                .map(parseDateString)
                .filter((date): date is Date => date !== null)
              next[offer.id] = parsedDates
            })
            return next
          })
          setCustomDateErrors({})
          setCustomDateSuccesses({})
          setSavingCustomDates({})
        }
      } catch {
        if (isMounted) {
          setOffers([])
          setOffersError('Δεν ήταν δυνατή η φόρτωση των προσφορών. Δοκιμάστε ξανά αργότερα.')
        }
      } finally {
        if (isMounted) {
          setOffersLoading(false)
        }
      }
    }

    loadOffers()

    return () => {
      isMounted = false
    }
  }, [request.id])

  useEffect(() => {
    setVehicleForm(createVehicleFormState(vehicleDetails))
  }, [vehicleDetails])

  useEffect(() => {
    const mapped = mapVehicleDetailsFromApi(request.vehicle)
    setVehicleDetails(mapped)
  }, [request.id, request.updatedAt, request.vehicle])

  const handleOpenVehicleModal = () => {
    setVehicleFormError(null)
    setVehicleUpdateError(null)
    setVehicleForm(createVehicleFormState(vehicleDetails))
    setIsVehicleModalOpen(true)
  }

  const handleCloseVehicleModal = () => {
    if (!vehicleFormSaving) {
      setIsVehicleModalOpen(false)
    }
  }

  const handleVehicleFieldChange = (field: keyof VehicleFormState, value: string) => {
    setVehicleForm((prev) => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSaveVehicleDetails = async () => {
    if (!request.vehicleId) {
      setVehicleFormError('Δεν είναι διαθέσιμο το όχημα για ενημέρωση.')
      return
    }

    if (!vehicleForm.brand.trim()) {
      setVehicleFormError('Συμπληρώστε τη μάρκα του οχήματος.')
      return
    }

    if (!vehicleForm.model.trim()) {
      setVehicleFormError('Συμπληρώστε το μοντέλο του οχήματος.')
      return
    }

    setVehicleFormError(null)
    setVehicleUpdateError(null)
    setVehicleFormSaving(true)

    const payload: Record<string, unknown> = {
      brand: vehicleForm.brand.trim(),
      model: vehicleForm.model.trim(),
      isAutomatic: vehicleForm.isAutomatic === 'true',
      is4x4: vehicleForm.is4x4 === 'true',
      isTurbo: vehicleForm.isTurbo === 'true'
    }

    const engineValue = vehicleForm.engineCC.trim()
      ? sanitizeEngineValue(vehicleForm.engineCC)
      : null

    if (engineValue !== null) {
      payload.engineCC = engineValue
    } else {
      payload.engineCC = null
    }

    const yearValue = vehicleForm.modelYear.trim()
    if (yearValue) {
      payload.modelYear = yearValue
      payload.year = yearValue
    } else {
      payload.modelYear = null
      payload.year = null
    }

    if (vehicleForm.fuelType.trim()) {
      payload.fuelType = vehicleForm.fuelType.trim()
    } else {
      payload.fuelType = null
    }

    if (vehicleForm.vinNumber.trim()) {
      payload.vinNumber = vehicleForm.vinNumber.trim()
    } else {
      payload.vinNumber = null
    }

    if (vehicleForm.engineNumber.trim()) {
      payload.engineNumber = vehicleForm.engineNumber.trim()
    } else {
      payload.engineNumber = null
    }

    try {
      const response = await fetch(`/api/vehicles/${request.vehicleId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        const errorMessage =
          data?.error || 'Δεν ήταν δυνατή η ενημέρωση των στοιχείων οχήματος.'
        setVehicleFormError(errorMessage)
        setVehicleUpdateError(errorMessage)
        return
      }

      const updatedVehicle = mapVehicleDetailsFromApi(data.vehicle)
      setVehicleDetails(updatedVehicle)
      setVehicleForm(createVehicleFormState(updatedVehicle))
      if (onRequestUpdate && updatedVehicle) {
        const updatedRequest: ServiceRequest = {
          ...request,
          vehicle: {
            ...(request.vehicle ?? {}),
            ...updatedVehicle
          },
          updatedAt: data.vehicle?.updatedAt ?? new Date().toISOString()
        }
        onRequestUpdate(updatedRequest)
      }
      setIsVehicleModalOpen(false)
      setVehicleUpdateMessage('Τα στοιχεία του οχήματος ενημερώθηκαν με επιτυχία.')
      setTimeout(() => setVehicleUpdateMessage(null), 5000)
    } catch (error) {
      console.error('Error updating vehicle details:', error)
      setVehicleFormError('Παρουσιάστηκε σφάλμα κατά την ενημέρωση. Δοκιμάστε ξανά.')
      setVehicleUpdateError('Παρουσιάστηκε σφάλμα κατά την ενημέρωση. Δοκιμάστε ξανά.')
    } finally {
      setVehicleFormSaving(false)
    }
  }

  return (
    <>
      <div className="space-y-6">
        {/* Status badge */}
        <div className="flex items-center gap-3">
          {getStatusIcon(request.status)}
          <span className={`text-[0.65rem] font-black uppercase tracking-[0.1em] px-3 py-1 rounded-full ${getStatusColor(request.status)}`}>
            {getStatusText(request.status)}
          </span>
        </div>

        <ServiceVehicleCard
          serviceDescription={request.description}
          category={request.category}
          estimatedCost={request.estimatedCost}
          vehicle={vehicleDetails}
          photoCount={request.photoUrls.length}
          showEstimatedCost={request.estimatedCost !== undefined && request.estimatedCost !== null}
          editable={Boolean(request.vehicleId) && request.status !== ServiceRequestStatus.APPOINTMENT}
          onEditClick={handleOpenVehicleModal}
        />

        {vehicleUpdateMessage && (
          <div className="rounded-xl bg-green-50 border border-green-100 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
            <Icon name="check_circle" filled size="sm" className="text-green-600" />
            {vehicleUpdateMessage}
          </div>
        )}

        {vehicleUpdateError && (
          <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <Icon name="error" filled size="sm" className="text-red-600" />
            {vehicleUpdateError}
          </div>
        )}

        {/* Photos */}
        {request.photoUrls.length > 0 && (
          <div className="bg-surface-container-lowest rounded-xl p-5 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10">
            <h3 className="text-lg font-bold text-on-surface mb-3 flex items-center gap-2">
              <Icon name="photo_library" size="md" className="text-on-surface-variant" />
              Φωτογραφίες ({request.photoUrls.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {request.photoUrls.map((url, index) => (
                <div key={index} className="relative aspect-square bg-surface-container rounded-xl overflow-hidden">
                  <Image
                    src={url}
                    alt={`Φωτογραφία ${index + 1}`}
                    fill
                    className="object-cover"
                    onError={(e) => {
                      e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzY2NzM4NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkZvdG9ncmFwaGlhPC90ZXh0Pjwvc3ZnPg=='
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Accept error */}
        {acceptError && (
          <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <Icon name="error" filled size="sm" className="text-red-600" />
            {acceptError}
          </div>
        )}

        {/* Offers */}
        <div className="bg-surface-container-lowest rounded-xl p-5 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10">
          <h3 className="text-lg font-bold text-on-surface mb-4 flex items-center gap-2">
            <Icon name="local_offer" size="md" className="text-primary" />
            Προσφορές από Συνεργεία
          </h3>
          {offersLoading ? (
            <div className="flex items-center gap-3 text-sm text-on-surface-variant py-4">
              <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span>Φόρτωση προσφορών...</span>
            </div>
          ) : offersError ? (
            <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl p-4 flex items-center gap-2">
              <Icon name="error" size="sm" className="text-red-600" />
              {offersError}
            </div>
          ) : offers.length === 0 ? (
            <div className="bg-blue-50 border border-blue-100 text-blue-700 text-sm rounded-xl p-4 flex items-center gap-2">
              <Icon name="info" size="sm" className="text-blue-600" />
              Δεν υπάρχουν ακόμη προσφορές από συνεργεία. Θα σας ενημερώσουμε μόλις λάβουμε κάποια.
            </div>
          ) : (
            <div className="space-y-3">
              {offers.map((offer, index) => {
                const availabilityDates = offer.availabilityDates || []
                const hasAvailability = availabilityDates.length > 0
                const selectedDate = selectedOfferDates[offer.id] || null
                const canAcceptOffer =
                  hasAvailability &&
                  Boolean(selectedDate) &&
                  request.status !== ServiceRequestStatus.APPOINTMENT &&
                  offer.status !== OfferStatus.ACCEPTED &&
                  offer.status !== OfferStatus.REJECTED
                const isExpanded = expandedOfferId === offer.id
                const isCustomOpen = customPickerOpen[offer.id]
                const customDates = customDatesByOffer[offer.id] || []
                const customError = customDateErrors[offer.id]
                const customSuccess = customDateSuccesses[offer.id]
                const isSaving = savingCustomDates[offer.id] || false
                const benefits = Array.isArray(offer.benefits) && offer.benefits.length > 0
                  ? offer.benefits
                  : Array.isArray(offer.garage?.benefits) && offer.garage.benefits.length > 0
                    ? offer.garage.benefits
                    : []
                const isAcceptedOffer = request.acceptedOfferId === offer.id

                return (
                  <div
                    key={offer.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleOfferCardClick(offer.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        handleOfferCardClick(offer.id)
                      }
                    }}
                    className={`rounded-xl border transition-all duration-200 ${
                      isExpanded
                        ? 'border-primary/30 bg-surface-container-lowest shadow-md'
                        : 'border-outline-variant/10 bg-surface-container hover:border-primary/20'
                    } p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      request.status === ServiceRequestStatus.APPOINTMENT && offer.status === OfferStatus.REJECTED
                        ? 'opacity-50 pointer-events-none'
                        : ''
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                          Προσφορά {index + 1}
                        </p>
                        {offer.garage?.companyName && (
                          <p className="text-base font-bold text-on-surface mt-1">
                            {offer.garage.companyName}
                          </p>
                        )}
                        <p className="text-sm text-on-surface-variant mt-1 flex items-center gap-1">
                          <Icon name="location_on" size="sm" />
                          {getGarageAreaText(offer.garage?.address)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                          {isAcceptedOffer ? 'Τελικό ποσό' : 'Τιμή'}
                        </p>
                        <p className="text-xl font-black text-on-surface">
                          {formatCurrency(offer.appointmentPrice ?? offer.offerAmount)}
                        </p>
                        {isAcceptedOffer && request.appointmentDate && (
                          <p className="text-xs font-bold text-green-700 mt-1 flex items-center gap-1 justify-end">
                            <Icon name="event_available" size="sm" className="text-green-600" />
                            {formatAvailabilityDate(request.appointmentDate)}
                          </p>
                        )}
                        {offer.estimatedCost && offer.estimatedCost > 0 && (
                          <p className="text-xs text-on-surface-variant mt-1">
                            Εκτιμώμενο: {formatCurrency(offer.estimatedCost)}
                          </p>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 space-y-4 border-t border-outline-variant/10 pt-4">
                        {/* Benefits */}
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant mb-2">
                            Παροχές Εργασίας
                          </p>
                          {benefits.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {benefits.map((benefit, benefitIndex) => (
                                <span
                                  key={`${offer.id}-benefit-${benefitIndex}`}
                                  className="px-3 py-1 rounded-full bg-primary/10 text-sm font-bold text-primary"
                                >
                                  {benefit}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-on-surface-variant">
                              Το συνεργείο δεν έχει δηλώσει παροχές εργασίας για αυτή την προσφορά.
                            </p>
                          )}
                        </div>

                        {/* Availability header */}
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                            Διαθεσιμότητα συνεργείου
                          </p>
                          {offer.offerNumber && (
                            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                              {offer.offerNumber}
                            </span>
                          )}
                        </div>

                        {/* Availability dates */}
                        {availabilityDates.length > 0 ? (
                          <div className="space-y-3">
                            <p className="text-sm text-on-surface-variant">
                              {request.status === ServiceRequestStatus.APPOINTMENT
                                ? 'Διαθέσιμες ημερομηνίες συνεργείου:'
                                : 'Επιλέξτε μία από τις διαθέσιμες ημερομηνίες του συνεργείου.'}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {availabilityDates.map((date) => {
                                const isSelected = selectedDate === date
                                const isAppointment = request.status === ServiceRequestStatus.APPOINTMENT
                                const isDisabled = isAppointment || (selectedDate !== null && !isSelected)

                                return (
                                  <button
                                    key={date}
                                    type="button"
                                    disabled={isDisabled}
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      handleSelectOfferDate(offer.id, date)
                                    }}
                                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all duration-200 ${
                                      isSelected
                                        ? 'bg-gradient-to-br from-primary to-primary-container text-on-primary shadow-lg shadow-primary/20'
                                        : isDisabled
                                          ? 'bg-surface-container border border-outline-variant/10 text-on-surface-variant/40 cursor-not-allowed'
                                          : 'bg-surface-container border border-outline-variant/20 text-on-surface hover:border-primary/30'
                                    }`}
                                  >
                                    {formatAvailabilityDate(date)}
                                  </button>
                                )
                              })}
                            </div>
                            {selectedDate && (
                              <div className="mt-2 p-3 bg-primary/5 border border-primary/10 rounded-xl text-sm text-on-surface flex items-center gap-2">
                                <Icon name="event_available" filled size="sm" className="text-primary" />
                                Έχετε επιλέξει:{' '}
                                <span className="font-bold text-primary">
                                  {formatAvailabilityDate(selectedDate)}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-on-surface-variant">
                            Το συνεργείο δεν έχει δηλώσει ακόμη διαθέσιμες ημερομηνίες για την προσφορά αυτή.
                          </p>
                        )}

                        {/* Client availability dates already submitted */}
                        {(offer.clientAvailabilityDates?.length || 0) > 0 && !isCustomOpen && (
                          <div>
                            <h4 className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant mb-2">
                              Ημερομηνίες που προτείνατε ({offer.clientAvailabilityDates?.length})
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {(offer.clientAvailabilityDates || [])
                                .slice()
                                .sort()
                                .map((date) => (
                                  <span
                                    key={date}
                                    className="px-3 py-1 bg-surface-container border border-outline-variant/10 text-on-surface-variant rounded-full text-sm font-medium"
                                  >
                                    {formatAvailabilityDate(date)}
                                  </span>
                                ))}
                            </div>
                          </div>
                        )}

                        {/* Custom date picker toggle */}
                        {hasAvailability && request.status !== ServiceRequestStatus.APPOINTMENT && (
                          <>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleToggleCustomPicker(offer.id)
                              }}
                              className={`px-4 py-2 rounded-xl border text-sm font-bold transition-all duration-200 ${
                                isCustomOpen
                                  ? 'bg-primary/10 border-primary/30 text-primary'
                                  : 'bg-surface-container-lowest border-dashed border-outline-variant/30 text-on-surface-variant hover:border-primary/30 hover:text-primary'
                              }`}
                            >
                              {isCustomOpen ? 'Κλείσιμο επιλογής ημερομηνιών' : 'Προσθέστε δικές σας ημερομηνίες'}
                            </button>

                            {isCustomOpen && (
                              <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
                                <p className="text-sm text-on-surface-variant">
                                  Επιλέξτε έως 5 ημερομηνίες (Δευτέρα - Παρασκευή) που σας εξυπηρετούν. Θα ενημερώσουμε το συνεργείο.
                                </p>
                                <div className="flex justify-center">
                                  <DayPicker
                                    mode="multiple"
                                    selected={customDates}
                                    onSelect={(dates) => handleCustomDateSelect(offer.id, dates)}
                                    locale={el}
                                    disabled={[
                                      { before: addDays(new Date(), 1) },
                                      (date) => isWeekend(date),
                                      { after: addMonths(new Date(), 2) }
                                    ]}
                                    fromDate={addDays(new Date(), 1)}
                                    toDate={addMonths(new Date(), 2)}
                                    className="border border-outline-variant/10 rounded-xl p-4"
                                    modifiersClassNames={{
                                      selected: 'bg-primary text-on-primary hover:bg-primary-container',
                                      today: 'font-bold text-primary'
                                    }}
                                    styles={{
                                      root: { color: '#1b1c1c' },
                                      caption_label: { color: '#1b1c1c', fontWeight: 700 },
                                      nav_button: { color: '#1b1c1c' },
                                      head_cell: { color: '#554434' },
                                      day: { color: '#1b1c1c' },
                                      day_disabled: { color: '#d1d5db' },
                                      day_outside: { color: '#d1d5db' }
                                    }}
                                  />
                                </div>

                                {customError && (
                                  <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl p-3 flex items-center gap-2">
                                    <Icon name="error" size="sm" className="text-red-600" />
                                    {customError}
                                  </div>
                                )}

                                {customDates.length > 0 && (
                                  <div className="p-3 bg-primary/5 border border-primary/10 rounded-xl">
                                    <h5 className="text-xs font-bold text-on-surface mb-2">
                                      Επιλεγμένες ημερομηνίες ({customDates.length}/5)
                                    </h5>
                                    <div className="flex flex-wrap gap-2">
                                      {customDates
                                        .slice()
                                        .sort((a, b) => a.getTime() - b.getTime())
                                        .map((date, customIndex) => (
                                          <span
                                            key={`${date.getTime()}-${customIndex}`}
                                            className="px-3 py-1 bg-gradient-to-br from-primary to-primary-container text-on-primary rounded-full text-sm font-bold"
                                          >
                                            {formatCustomDateLabel(date)}
                                          </span>
                                        ))}
                                    </div>
                                  </div>
                                )}

                                <div className="flex flex-wrap gap-3">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      handleSaveCustomDates(offer)
                                    }}
                                    disabled={isSaving || customDates.length === 0}
                                    className={`${styles.btnPrimary} ${
                                      isSaving || customDates.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                                    }`}
                                  >
                                    {isSaving ? 'Αποστολή...' : 'Αποστολή προτεινόμενων ημερομηνιών'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      handleClearCustomDates(offer.id)
                                    }}
                                    className={styles.btnOutline}
                                  >
                                    Καθαρισμός επιλογών
                                  </button>
                                </div>

                                {customSuccess && (
                                  <div className="bg-green-50 border border-green-100 text-green-800 text-sm rounded-xl p-3 flex items-center gap-2">
                                    <Icon name="check_circle" filled size="sm" className="text-green-600" />
                                    {customSuccess}
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        )}

                        {/* Accept offer button */}
                        {request.status !== ServiceRequestStatus.APPOINTMENT && offer.status !== OfferStatus.ACCEPTED && (
                          <div className="flex flex-wrap gap-3 pt-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleAcceptOffer(offer)
                              }}
                              disabled={!canAcceptOffer || acceptingOfferId === offer.id}
                              className={`${styles.btnPrimary} ${
                                !canAcceptOffer || acceptingOfferId === offer.id
                                  ? 'opacity-50 cursor-not-allowed'
                                  : ''
                              }`}
                            >
                              <Icon name="check_circle" size="sm" />
                              {acceptingOfferId === offer.id ? 'Αποδοχή...' : 'Αποδοχή προσφοράς'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Status-specific banners */}
        {request.status === ServiceRequestStatus.APPOINTMENT && (
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
            <div className="flex items-start gap-3">
              <Icon name="event" filled className="text-blue-600 flex-shrink-0 mt-0.5" size="md" />
              <div>
                <h4 className="font-bold text-blue-900 mb-1">Ραντεβού Προγραμματισμένο</h4>
                <p className="text-sm text-blue-800 mb-3">
                  Έχετε προγραμματίσει ραντεβού για αυτή την υπηρεσία. Θα επικοινωνήσουμε μαζί σας σύντομα.
                </p>
                <div className="flex gap-2">
                  <button className={`${styles.btnPrimary} text-sm`}>
                    <Icon name="phone" size="sm" />
                    Επικοινωνία
                  </button>
                  <button className={`${styles.btnOutline} text-sm`}>
                    <Icon name="location_on" size="sm" />
                    Τοποθεσία
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showWaitingForResponsesBanner && (
          <div className="bg-primary/5 rounded-xl p-4 border border-primary/10">
            <div className="flex items-start gap-3">
              <Icon name="hourglass_top" filled className="text-primary flex-shrink-0 mt-0.5" size="md" />
              <div>
                <h4 className="font-bold text-on-surface mb-1">Αναμονή Απαντήσεων</h4>
                <p className="text-sm text-on-surface-variant">
                  Το αίτημά σας έχει σταλεί σε συνεργεία. Περιμένετε προσφορές και θα ενημερωθείτε σύντομα.
                </p>
              </div>
            </div>
          </div>
        )}

        {request.status === ServiceRequestStatus.IN_PROGRESS && (
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
            <div className="flex items-start gap-3">
              <Icon name="engineering" filled className="text-blue-600 flex-shrink-0 mt-0.5" size="md" />
              <div>
                <h4 className="font-bold text-blue-900 mb-1">Εργασία σε Εξέλιξη</h4>
                <p className="text-sm text-blue-800">
                  Η εργασία έχει ξεκινήσει. Θα ενημερωθείτε για την πρόοδο.
                </p>
              </div>
            </div>
          </div>
        )}

        {request.status === ServiceRequestStatus.COMPLETED && (
          <div className="bg-green-50 rounded-xl p-4 border border-green-100">
            <div className="flex items-start gap-3">
              <Icon name="check_circle" filled className="text-green-600 flex-shrink-0 mt-0.5" size="md" />
              <div>
                <h4 className="font-bold text-green-900 mb-1">Ολοκληρώθηκε</h4>
                <p className="text-sm text-green-800">
                  Η εργασία έχει ολοκληρωθεί επιτυχώς. Ευχαριστούμε που επιλέξατε τις υπηρεσίες μας!
                </p>
              </div>
            </div>
          </div>
        )}

        {request.status === ServiceRequestStatus.CANCELLED && (
          <div className="bg-red-50 rounded-xl p-4 border border-red-100">
            <div className="flex items-start gap-3">
              <Icon name="cancel" filled className="text-red-600 flex-shrink-0 mt-0.5" size="md" />
              <div>
                <h4 className="font-bold text-red-900 mb-1">Ακυρώθηκε</h4>
                <p className="text-sm text-red-800">
                  Αυτό το αίτημα έχει ακυρωθεί. Εάν χρειάζεστε βοήθεια, μπορείτε να δημιουργήσετε νέο αίτημα.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <Modal
        isOpen={isVehicleModalOpen}
        onClose={handleCloseVehicleModal}
        title="Επεξεργασία στοιχείων οχήματος"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={handleCloseVehicleModal}
              disabled={vehicleFormSaving}
            >
              Ακύρωση
            </Button>
            <Button
              onClick={handleSaveVehicleDetails}
              loading={vehicleFormSaving}
            >
              Αποθήκευση
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          {vehicleFormError && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
              <Icon name="error" filled size="sm" className="text-red-600" />
              {vehicleFormError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Μάρκα"
              value={vehicleForm.brand}
              onChange={(value) => handleVehicleFieldChange('brand', value)}
              required
            />
            <Input
              label="Μοντέλο"
              value={vehicleForm.model}
              onChange={(value) => handleVehicleFieldChange('model', value)}
              required
            />
            <Input
              label="Κυβικά (cc)"
              value={vehicleForm.engineCC}
              onChange={(value) => handleVehicleFieldChange('engineCC', value)}
            />
            <Input
              label="Έτος"
              value={vehicleForm.modelYear}
              onChange={(value) => handleVehicleFieldChange('modelYear', value)}
            />
            <div>
              <label className={styles.label}>Καύσιμο</label>
              <select
                className={styles.select}
                value={vehicleForm.fuelType}
                onChange={(event) => handleVehicleFieldChange('fuelType', event.target.value)}
              >
                {fuelTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="VIN"
              value={vehicleForm.vinNumber}
              onChange={(value) => handleVehicleFieldChange('vinNumber', value)}
            />
            <Input
              label="Αρ. Κινητήρα"
              value={vehicleForm.engineNumber}
              onChange={(value) => handleVehicleFieldChange('engineNumber', value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Checkbox
              checked={vehicleForm.isAutomatic === 'true'}
              onChange={(checked) =>
                handleVehicleFieldChange('isAutomatic', checked ? 'true' : 'false')
              }
              label="Αυτόματο κιβώτιο"
            />
            <Checkbox
              checked={vehicleForm.is4x4 === 'true'}
              onChange={(checked) =>
                handleVehicleFieldChange('is4x4', checked ? 'true' : 'false')
              }
              label="4x4"
            />
            <Checkbox
              checked={vehicleForm.isTurbo === 'true'}
              onChange={(checked) =>
                handleVehicleFieldChange('isTurbo', checked ? 'true' : 'false')
              }
              label="Turbo"
            />
          </div>
        </div>
      </Modal>

      {/* Payment Modal */}
      {showPaymentModal && pendingOffer && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={handlePaymentModalClose}
          offerAmount={pendingOffer.offerAmount}
          depositAmount={paymentAmounts?.deposit ?? 0}
          remainingAmount={paymentAmounts?.remaining ?? 0}
          clientSecret={paymentClientSecret}
          savedCards={paymentSavedCards}
          isLoading={paymentLoading}
          error={paymentError}
          onPaymentSuccess={handlePaymentSuccess}
          onPaymentError={(err) => setPaymentError(err)}
        />
      )}
    </>
  )
}
