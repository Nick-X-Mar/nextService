'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { HiMapPin, HiPhone } from 'react-icons/hi2'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'
import { addDays, addWeeks, format, isWeekend } from 'date-fns'
import { el } from 'date-fns/locale'
import { styles } from '../../../styles/styles'

interface ServiceRequest {
  id: string
  clientId: string
  vehicleId: string
  category: string
  description: string
  status: 'appointment' | 'pending' | 'in-progress' | 'completed' | 'cancelled'
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
    modelYear?: string
    engineCC?: string
    fuelType?: string
    isAutomatic?: boolean
    is4x4?: boolean
    isTurbo?: boolean
  }
  clientAvailabilityDates?: string[]
}

interface Offer {
  id: string
  offerAmount: number
  estimatedCost?: number
  availabilityDates?: string[]
  garageId?: string
  offerNumber?: string
  status?: string
  createdAt?: string
  updatedAt?: string
  clientAvailabilityDates?: string[]
}

interface GarageSummary {
  id: string
  companyName?: string
  address?: string
}

interface OfferWithGarage extends Offer {
  garage?: GarageSummary | null
}

interface RequestDetailsContentProps {
  request: ServiceRequest
  getStatusIcon: (status: string) => React.ReactNode
  getStatusText: (status: string) => string
  getStatusColor: (status: string) => string
}

export default function RequestDetailsContent({ 
  request, 
  getStatusIcon, 
  getStatusText, 
  getStatusColor 
}: RequestDetailsContentProps) {
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

  const hasOffers =
    typeof offers !== 'undefined' && Array.isArray(offers) && offers.length > 0
  const showWaitingForResponsesBanner = request.status === 'pending' && !hasOffers

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

  const getCategoryText = (category: string) => {
    switch (category) {
      case 'service':
        return 'Συντήρηση'
      case 'fanopeia':
        return 'Φανοποιεία'
      case 'oils':
        return 'Λάδια & Υγρά'
      case 'disk':
        return 'Δισκόφρενα'
      default:
        return category
    }
  }

  const normalizeBoolean = (value?: boolean | string | null) => {
    if (typeof value === 'boolean') {
      return value
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (normalized === 'true') return true
      if (normalized === 'false') return false
    }
    return null
  }

  const getFuelTypeText = (fuelType?: string | null) => {
    if (!fuelType) {
      return 'Δεν έχει δηλωθεί'
    }

    const normalized = fuelType.trim().toLowerCase()

    switch (normalized) {
      case 'petrol':
      case 'gasoline':
        return 'Βενζίνη'
      case 'diesel':
        return 'Πετρέλαιο'
      case 'hybrid':
        return 'Υβριδικό'
      case 'electric':
        return 'Ηλεκτρικό'
      case 'lpg':
        return 'Υγραέριο (LPG)'
      case 'cng':
        return 'Φυσικό Αέριο (CNG)'
      default:
        return fuelType
    }
  }

  const getTransmissionText = (isAutomatic?: boolean | string | null) => {
    const value = normalizeBoolean(isAutomatic)
    if (value === true) {
      return 'Αυτόματο'
    }
    if (value === false) {
      return 'Χειροκίνητο'
    }
    return 'Δεν έχει δηλωθεί'
  }

  const getBooleanText = (value?: boolean | string | null) => {
    const normalized = normalizeBoolean(value)
    if (normalized === true) {
      return 'Ναι'
    }
    if (normalized === false) {
      return 'Όχι'
    }
    return 'Δεν έχει δηλωθεί'
  }

  const formatEngineCC = (engineCC?: string | number | null) => {
    if (engineCC === null || engineCC === undefined || engineCC === '') {
      return 'Δεν έχει δηλωθεί'
    }

    const value = typeof engineCC === 'number' ? engineCC.toString() : engineCC
    return `${value} cc`
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

  const handleAcceptOffer = (offer: OfferWithGarage) => {
    console.log('Accept offer', offer.id)
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
              const garageSummary: GarageSummary = {
                id: garageData?.garage?.id ?? offer.garageId,
                companyName: garageData?.garage?.companyName,
                address: garageData?.garage?.address
              }

              garageCache.set(offer.garageId, garageSummary)
              return { ...offer, garage: garageSummary }
            } catch (error) {
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
      } catch (error) {
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

  return (
    <div className="space-y-6">
      {/* Status and Priority */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {getStatusIcon(request.status)}
          <span className={`px-3 py-1 text-sm font-medium rounded-full border ${getStatusColor(request.status)}`}>
            {getStatusText(request.status)}
          </span>
        </div>
      </div>

      {/* Vehicle Information */}
      {request.vehicle && (
        <div className={styles.cardSimple}>
          <h3 className={`${styles.cardTitle} mb-3`}>Πληροφορίες Οχήματος</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-600">Μάρκα</p>
              <p className="font-medium text-black">{request.vehicle.brand}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Μοντέλο</p>
              <p className="font-medium text-black">{request.vehicle.model}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Έτος</p>
              <p className="font-medium text-black">{request.vehicle.modelYear || 'Δεν έχει δηλωθεί'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Κυβικά</p>
              <p className="font-medium text-black">{formatEngineCC(request.vehicle.engineCC)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Καύσιμο</p>
              <p className="font-medium text-black">{getFuelTypeText(request.vehicle.fuelType)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Κιβώτιο Ταχυτήτων</p>
              <p className="font-medium text-black">{getTransmissionText(request.vehicle.isAutomatic)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">4x4</p>
              <p className="font-medium text-black">{getBooleanText(request.vehicle.is4x4)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Turbo</p>
              <p className="font-medium text-black">{getBooleanText(request.vehicle.isTurbo)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Service Details */}
      <div className={styles.cardSimple}>
        <h3 className={`${styles.cardTitle} mb-3`}>Λεπτομέρειες Υπηρεσίας</h3>
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-600">Κατηγορία</p>
            <p className="font-medium text-black">{getCategoryText(request.category)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Περιγραφή</p>
            <p className="font-medium text-black">{request.description}</p>
          </div>
          {request.estimatedCost && (
            <div>
              <p className="text-sm text-gray-600">Εκτιμώμενο Κόστος</p>
              <p className="font-medium text-green-600">€{request.estimatedCost}</p>
            </div>
          )}
        </div>
      </div>

      {/* Photos */}
      {request.photoUrls.length > 0 && (
        <div className={styles.cardSimple}>
          <h3 className={`${styles.cardTitle} mb-3`}>
            Φωτογραφίες ({request.photoUrls.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {request.photoUrls.map((url, index) => (
              <div key={index} className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden">
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

      {/* Offers */}
      <div className={styles.cardSimple}>
        <h3 className={`${styles.cardTitle} mb-3`}>Προσφορές από Συνεργεία</h3>
        {offersLoading ? (
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <div className="h-5 w-5 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
            <span>Φόρτωση προσφορών...</span>
          </div>
        ) : offersError ? (
          <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-lg p-3">
            {offersError}
          </div>
        ) : offers.length === 0 ? (
          <div className="bg-blue-50 border border-blue-100 text-blue-700 text-sm rounded-lg p-3">
            Δεν υπάρχουν ακόμη προσφορές από συνεργεία. Θα σας ενημερώσουμε μόλις λάβουμε κάποια.
          </div>
        ) : (
          <div className="space-y-4">
            {offers.map((offer, index) => {
              const availabilityDates = offer.availabilityDates || []
              const hasAvailability = availabilityDates.length > 0
              const selectedDate = selectedOfferDates[offer.id] || null
              const canAcceptOffer = hasAvailability && Boolean(selectedDate)
              const isExpanded = expandedOfferId === offer.id
              const isCustomOpen = customPickerOpen[offer.id]
              const customDates = customDatesByOffer[offer.id] || []
              const customError = customDateErrors[offer.id]
              const customSuccess = customDateSuccesses[offer.id]
              const isSaving = savingCustomDates[offer.id] || false

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
                  className={`rounded-xl border transition-colors ${
                    isExpanded
                      ? 'border-orange-300 bg-white shadow-sm'
                      : 'border-gray-200 bg-gray-50 hover:border-orange-200'
                  } p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-700">
                        Προσφορά {index + 1}
                      </p>
                      {offer.garage?.companyName && (
                        <p className="text-base font-semibold text-gray-900 mt-1">
                          {offer.garage.companyName}
                        </p>
                      )}
                      <p className="text-sm text-gray-600 mt-1">
                        Περιοχή:{' '}
                        <span className="font-medium text-gray-900">
                          {getGarageAreaText(offer.garage?.address)}
                        </span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">Τιμή</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {formatCurrency(offer.offerAmount)}
                      </p>
                      {offer.estimatedCost && offer.estimatedCost > 0 && (
                        <p className="text-xs text-gray-500 mt-1">
                          Εκτιμώμενο κόστος: {formatCurrency(offer.estimatedCost)}
                        </p>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-800">
                          Διαθεσιμότητα συνεργείου
                        </p>
                        {offer.offerNumber && (
                          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                            {offer.offerNumber}
                          </span>
                        )}
                      </div>

                      {availabilityDates.length > 0 ? (
                        <div className="space-y-3">
                          <p className="text-sm text-gray-600">
                            Επιλέξτε μία από τις διαθέσιμες ημερομηνίες του συνεργείου.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {availabilityDates.map((date) => (
                              <button
                                key={date}
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleSelectOfferDate(offer.id, date)
                                }}
                                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors duration-200 ${
                                  selectedDate === date
                                    ? 'bg-orange-500 border-orange-500 text-white shadow-sm'
                                    : 'bg-white border-gray-200 text-gray-700 hover:border-orange-300 hover:text-orange-600'
                                }`}
                              >
                                {formatAvailabilityDate(date)}
                              </button>
                            ))}
                          </div>
                          {selectedDate && (
                            <div className="mt-2 p-3 bg-orange-50 border border-orange-100 rounded-lg text-sm text-orange-800">
                              Έχετε επιλέξει:{' '}
                              <span className="font-semibold text-orange-900">
                                {formatAvailabilityDate(selectedDate)}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-600">
                          Το συνεργείο δεν έχει δηλώσει ακόμη διαθέσιμες ημερομηνίες για την προσφορά αυτή.
                        </p>
                      )}

                      {(offer.clientAvailabilityDates?.length || 0) > 0 && !isCustomOpen && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                            Ημερομηνίες που προτείνατε ({offer.clientAvailabilityDates?.length})
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {(offer.clientAvailabilityDates || [])
                              .slice()
                              .sort()
                              .map((date) => (
                                <span
                                  key={date}
                                  className="px-3 py-1 bg-gray-100 border border-gray-200 text-gray-700 rounded-full text-sm"
                                >
                                  {formatAvailabilityDate(date)}
                                </span>
                              ))}
                          </div>
                        </div>
                      )}

                      {hasAvailability && (
                        <>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              handleToggleCustomPicker(offer.id)
                            }}
                            className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors duration-200 ${
                              isCustomOpen
                                ? 'bg-orange-100 border-orange-400 text-orange-700 shadow-sm'
                                : 'bg-white border-dashed border-gray-300 text-gray-600 hover:border-orange-300 hover:text-orange-600'
                            }`}
                          >
                            {isCustomOpen ? 'Κλείσιμο επιλογής ημερομηνιών' : 'Προσθέστε δικές σας ημερομηνίες'}
                          </button>

                          {isCustomOpen && (
                            <div className="space-y-4">
                              <p className="text-sm text-gray-600">
                                Επιλέξτε έως 5 ημερομηνίες (Δευτέρα - Παρασκευή) που σας εξυπηρετούν. Θα ενημερώσουμε το συγκεκριμένο συνεργείο.
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

                              {customError && (
                                <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-lg p-3">
                                  {customError}
                                </div>
                              )}

                              {customDates.length > 0 && (
                                <div className="p-3 bg-orange-50 border border-orange-100 rounded-lg">
                                  <h5 className="text-sm font-medium text-orange-900 mb-2">
                                    Επιλεγμένες ημερομηνίες ({customDates.length}/5)
                                  </h5>
                                  <div className="flex flex-wrap gap-2">
                                    {customDates
                                      .slice()
                                      .sort((a, b) => a.getTime() - b.getTime())
                                      .map((date, customIndex) => (
                                        <span
                                          key={`${date.getTime()}-${customIndex}`}
                                          className="px-3 py-1 bg-orange-500 text-white rounded-full text-sm"
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
                                    isSaving || customDates.length === 0 ? 'opacity-60 cursor-not-allowed' : ''
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
                                  className={styles.btnSecondary}
                                >
                                  Καθαρισμός επιλογών
                                </button>
                              </div>

                              {customSuccess && (
                                <div className="bg-green-50 border border-green-100 text-green-800 text-sm rounded-lg p-3">
                                  {customSuccess}
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}

                      <div className="flex flex-wrap gap-3 pt-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleAcceptOffer(offer)
                          }}
                          disabled={!canAcceptOffer}
                          className={`${styles.btnPrimary} px-4 py-2 text-sm ${
                            !canAcceptOffer ? 'opacity-60 cursor-not-allowed' : ''
                          }`}
                        >
                          Αποδοχή προσφοράς
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Status-specific information */}
      {request.status === 'appointment' && (
        <div className="bg-blue-50 p-4 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2">📅 Ραντεβού Προγραμματισμένο</h4>
          <p className="text-sm text-blue-800 mb-3">
            Έχετε προγραμματίσει ραντεβού για αυτή την υπηρεσία. Θα επικοινωνήσουμε μαζί σας σύντομα.
          </p>
          <div className="flex gap-2">
            <button className={`${styles.btnPrimary} text-sm px-4 py-2`}>
              <HiPhone className="h-4 w-4 mr-2" />
              Επικοινωνία
            </button>
            <button className={`${styles.btnSecondary} text-sm px-4 py-2`}>
              <HiMapPin className="h-4 w-4 mr-2" />
              Τοποθεσία
            </button>
          </div>
        </div>
      )}

      {showWaitingForResponsesBanner && (
        <div className="bg-yellow-50 p-4 rounded-lg">
          <h4 className="font-medium text-yellow-900 mb-2">⏳ Αναμονή Απαντήσεων</h4>
          <p className="text-sm text-yellow-800">
            Το αίτημά σας έχει σταλεί σε συνεργεία. Περιμένετε προσφορές και θα ενημερωθείτε σύντομα.
          </p>
        </div>
      )}

      {request.status === 'in-progress' && (
        <div className="bg-blue-50 p-4 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2">🔧 Εργασία σε Εξέλιξη</h4>
          <p className="text-sm text-blue-800">
            Η εργασία έχει ξεκινήσει. Θα ενημερωθείτε για την πρόοδο.
          </p>
        </div>
      )}

      {request.status === 'completed' && (
        <div className="bg-green-50 p-4 rounded-lg">
          <h4 className="font-medium text-green-900 mb-2">✅ Ολοκληρώθηκε</h4>
          <p className="text-sm text-green-800">
            Η εργασία έχει ολοκληρωθεί επιτυχώς. Ευχαριστούμε που επιλέξατε τις υπηρεσίες μας!
          </p>
        </div>
      )}

      {request.status === 'cancelled' && (
        <div className="bg-red-50 p-4 rounded-lg">
          <h4 className="font-medium text-red-900 mb-2">❌ Ακυρώθηκε</h4>
          <p className="text-sm text-red-800">
            Αυτό το αίτημα έχει ακυρωθεί. Εάν χρειάζεστε βοήθεια, μπορείτε να δημιουργήσετε νέο αίτημα.
          </p>
        </div>
      )}
    </div>
  )
}
