'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ServiceVehicleCard, LicensePhotoCard, Spinner, AvailabilityGrid } from '@/components'
import {
  buildDayHours,
  sanitizeSlots,
  datesWithNoHours,
  fillMissingSlots,
  type AvailabilitySlots,
} from '@/utils/availabilitySlots'
import { athensToday, isPastAthensDate } from '@/utils/athensTime'
import { useNavigation } from '@/hooks/useNavigation'
import { useAsyncTask } from '@/hooks/useAsyncTask'
import { useToast } from '@/hooks/useToast'
import { useNotifications } from '@/contexts/NotificationsContext'
import { styles } from '@/styles/styles'
import { OfferStatus, ServiceRequestStatus } from '@/types/statuses'
import Icon from '@/components/ui/Icon'
import { DayPicker } from 'react-day-picker'
import { addDays, addMonths, isWeekend, format } from 'date-fns'
import { el } from 'date-fns/locale'
import 'react-day-picker/dist/style.css'
import { isGarageInactive } from '../../../components/garageInactive'
import { formatAppointment, garageOfferState, offerStatusClass, offerStatusLabel } from '../../../components/offerStatus'
import { clientDisplayName } from '../../../components/clientLabel'

/**
 * Only the garage that won the job gets the client's surname and contact
 * details; while it is quoting it sees the first name alone. So every field
 * here may be missing.
 */
interface Client {
  firstName?: string
  lastName?: string
  phoneNumber?: string
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
  /** Presigned by the API — short-lived, never stored. */
  licensePhotoUrl?: string | null
}

interface ServiceRequest {
  id: string
  description: string
  category: string
  status: string
  createdAt: string
  estimatedCost?: number | null
  acceptedOfferId?: string | null
  client: Client | null
  vehicle: Vehicle | null
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

/** The garage's own offer on this request, as the API stores it. */
interface StoredOffer {
  id: string
  offerNumber?: string
  offerAmount: number
  status: OfferStatus
  createdAt?: string
  benefits?: string[]
  availabilityDates?: string[]
  availabilitySlots?: AvailabilitySlots
  clientAvailabilityDates?: string[]
  clientAvailabilityProposedAt?: string
  appointmentDate?: string
  appointmentTime?: string | null
}

/** What was last saved — the yardstick for "has the garage changed anything?". */
interface SavedOffer {
  offerAmount: number
  benefits: string[]
  availabilityDates: string[]
  availabilitySlots: AvailabilitySlots
}

interface OfferPageProps {
  garageId: string
  requestId: string
}

const toDate = (date: string) => new Date(`${date}T00:00:00`)

/** Order-insensitive fingerprint of a slot map, for change detection. */
const slotsKey = (slots: AvailabilitySlots) =>
  JSON.stringify(
    Object.keys(slots)
      .sort()
      .map((date) => [date, [...slots[date]].sort()])
  )

const sameList = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false
  const sortedB = [...b].sort()
  return [...a].sort().every((v, i) => v === sortedB[i])
}

/**
 * Old data can hold several offers by one garage on a request (offer ids were
 * random before the API made them one-per-garage). The one that matters is the
 * accepted one, else the live one, newest first — never simply whichever the
 * index happened to return first.
 */
function pickCurrentOffer(offers: StoredOffer[]): StoredOffer | null {
  const rank = (o: StoredOffer) =>
    o.status === OfferStatus.ACCEPTED ? 0 : o.status === OfferStatus.PENDING ? 1 : 2
  return (
    [...offers].sort(
      (a, b) => rank(a) - rank(b) || (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
    )[0] ?? null
  )
}

export default function OfferPage({ garageId, requestId }: OfferPageProps) {
  const [serviceRequest, setServiceRequest] = useState<ServiceRequest | null>(null)
  const [garage, setGarage] = useState<Garage | null>(null)
  const [offerNumber, setOfferNumber] = useState<string | undefined>()
  const [estimatedCost, setEstimatedCost] = useState(0)
  const [offerAmount, setOfferAmount] = useState(0)
  const [selectedBenefits, setSelectedBenefits] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  // The API refused this garage as not (or no longer) approved.
  const [inactive, setInactive] = useState(false)

  const [existingOffer, setExistingOffer] = useState<StoredOffer | null>(null)
  const [savedOffer, setSavedOffer] = useState<SavedOffer | null>(null)
  const [selectedDates, setSelectedDates] = useState<Date[]>([])
  // Per-date hourly availability. A date with no entry means "untouched",
  // which the grid renders as fully available.
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlots>({})
  // The garage's own working hours drive the grid rows.
  const [workdayHours, setWorkdayHours] = useState<{ start?: string; end?: string }>({})
  const [clientAvailabilityDates, setClientAvailabilityDates] = useState<string[]>([])

  const { navigate, isNavigating } = useNavigation()
  const { run, isPending } = useAsyncTask()
  const { showToast } = useToast()
  const { refresh: refreshNotifications } = useNotifications()

  // Sorted so the grid columns read left-to-right in date order.
  const selectedDateStrings = useMemo(
    () => selectedDates.map(d => format(d, 'yyyy-MM-dd')).sort(),
    [selectedDates]
  )
  const dayHours = useMemo(
    () => buildDayHours(workdayHours.start, workdayHours.end),
    [workdayHours]
  )
  // Drop slots for dates that are no longer selected — deselecting a day and
  // reselecting it should bring back a clean, fully-available column.
  const cleanSlots = useMemo(
    () => sanitizeSlots(availabilitySlots, selectedDateStrings),
    [availabilitySlots, selectedDateStrings]
  )
  // Bookable from tomorrow, counted from Athens' today rather than the device's.
  const firstBookableDay = useMemo(() => addDays(toDate(athensToday()), 1), [])
  const lastBookableDay = useMemo(() => addMonths(firstBookableDay, 2), [firstBookableDay])

  const isAccepted = existingOffer?.status === OfferStatus.ACCEPTED
  // An offer the client has answered (or that lost to another garage) is a
  // record, not a draft: the API refuses to change it, so the form stops
  // pretending it can.
  const offerLocked = !!existingOffer && existingOffer.status !== OfferStatus.PENDING
  // Judged on the request, not only on the offer: an offer can still read
  // "pending" on a request that was cancelled or booked elsewhere, and every
  // save on it would only bounce off the API's 409.
  const requestClosed = !!serviceRequest && serviceRequest.status !== ServiceRequestStatus.PENDING
  const readOnly = offerLocked || requestClosed
  const offerState = garageOfferState(existingOffer?.status, serviceRequest, existingOffer?.id)
  const clientName = clientDisplayName(serviceRequest?.client)

  const dashboardHref = `/garage-dashboard/${garageId}/`
  const offersHref = `/garage-dashboard/${garageId}/?tab=offers`
  const backHref = isAccepted
    ? `/garage-dashboard/${garageId}/?tab=appointments`
    : existingOffer
      ? offersHref
      : `/garage-dashboard/${garageId}/?tab=requests`
  const chatHref = `/garage-dashboard/${garageId}/chat/${requestId}/`

  // Seeing the accepted offer, or the dates the client proposed on a live one,
  // is what clears that alert. Keyed on the proposal's timestamp so a newer
  // proposal clears again, but an edit of the offer itself does not re-post.
  const seenOfferId = existingOffer?.id
  const seenKind =
    existingOffer?.status === OfferStatus.ACCEPTED
      ? 'accepted'
      : existingOffer?.status === OfferStatus.PENDING && (existingOffer.clientAvailabilityDates?.length ?? 0) > 0
        ? 'dates'
        : null
  const proposedAt = existingOffer?.clientAvailabilityProposedAt
  useEffect(() => {
    if (!seenOfferId || !seenKind) return
    fetch('/api/notifications/seen/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: seenKind, id: seenOfferId }),
    })
      .then(() => refreshNotifications())
      .catch(() => { /* stale banner only */ })
  }, [seenOfferId, seenKind, proposedAt, refreshNotifications])

  /** Puts a stored offer into the form, and remembers it as the saved state. */
  const applyOffer = useCallback((stored: StoredOffer) => {
    // Days that have passed can no longer be booked, and the API refuses to
    // save them — they would only block the next edit.
    const liveDates = (stored.availabilityDates ?? []).filter((d) => !isPastAthensDate(d)).sort()
    const liveSlots = sanitizeSlots(stored.availabilitySlots, liveDates)

    setExistingOffer(stored)
    setOfferNumber(stored.offerNumber)
    setOfferAmount(stored.offerAmount)
    setSelectedBenefits(stored.benefits ?? [])
    setSelectedDates(liveDates.map(toDate))
    setAvailabilitySlots(liveSlots)
    setClientAvailabilityDates(stored.clientAvailabilityDates ?? [])
    setSavedOffer({
      offerAmount: stored.offerAmount,
      benefits: stored.benefits ?? [],
      availabilityDates: liveDates,
      availabilitySlots: liveSlots,
    })
  }, [])

  /**
   * `silent` reloads in place — after a conflict the garage should see the
   * offer change under it, not the whole page blank out to a spinner.
   */
  const loadData = useCallback(async (silent = false) => {
    try {
      if (!silent) setIsLoading(true)

      const [requestResponse, garageResponse, offersResponse] = await Promise.all([
        // viewerGarageId is for the GDPR audit log.
        fetch(`/api/requests/${requestId}/?viewerGarageId=${garageId}`),
        fetch(`/api/garage/${garageId}/`),
        fetch(`/api/offers/?serviceRequestId=${requestId}&garageId=${garageId}`),
      ])
      const [requestData, garageData, offersData] = await Promise.all([
        requestResponse.json().catch(() => null),
        garageResponse.json().catch(() => null),
        offersResponse.json().catch(() => null),
      ])

      if (isGarageInactive(requestResponse, requestData) || isGarageInactive(offersResponse, offersData)) {
        setInactive(true)
        return
      }

      if (requestResponse.ok && requestData?.success) {
        setServiceRequest(requestData.request)
        setEstimatedCost(requestData.request.estimatedCost || 0)
      }

      if (garageResponse.ok && garageData?.success) {
        setGarage(garageData.garage)
        setWorkdayHours({
          start: garageData.garage.workdayStartTime,
          end: garageData.garage.workdayEndTime,
        })
        // A new offer starts with every benefit the garage offers ticked.
        if (garageData.garage.benefits?.length > 0) {
          setSelectedBenefits(garageData.garage.benefits)
        }
      }

      if (offersResponse.ok && offersData?.success) {
        const current = pickCurrentOffer(offersData.offers ?? [])
        if (current) applyOffer(current)
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setIsLoading(false)
    }
  }, [garageId, requestId, applyOffer])

  useEffect(() => {
    loadData()
  }, [loadData])

  /**
   * The API answered 409: the client accepted or another garage won while this
   * page was open, the request closed, or an offer already exists. Reload so
   * the page shows what is actually true, and say why nothing was saved.
   */
  const handleConflict = async (message?: string) => {
    showToast({
      type: 'warning',
      title: 'Η προσφορά δεν αποθηκεύτηκε',
      message: message || 'Η προσφορά άλλαξε στο μεταξύ. Δείτε την τρέχουσα κατάστασή της.',
      duration: 6000,
    })
    await loadData(true)
  }

  /** Common handling of a write's response; returns the body on success. */
  const readWrite = async (response: Response, failureTitle: string) => {
    const data = await response.json().catch(() => null)
    if (isGarageInactive(response, data)) {
      setInactive(true)
      return null
    }
    if (response.status === 409) {
      await handleConflict(data?.error)
      return null
    }
    if (!response.ok || !data?.success) {
      showToast({
        type: 'error',
        title: failureTitle,
        message: data?.error || 'Δεν ήταν δυνατή η σύνδεση με τον διακομιστή',
        duration: 5000,
      })
      return null
    }
    return data
  }

  /**
   * Adding a date the client proposed saves at once, but only that date: the
   * saved offer gains the day (with the garage's normal hours), while any
   * unsaved edits in the form stay unsaved.
   */
  const addClientDate = (dateStr: string) => run(`client-date-${dateStr}`, async () => {
    if (!existingOffer || !savedOffer || readOnly) return
    if (selectedDateStrings.includes(dateStr)) return

    const nextDates = Array.from(new Set([...savedOffer.availabilityDates, dateStr])).sort()
    const nextSlots = { ...savedOffer.availabilitySlots, [dateStr]: [...dayHours] }

    try {
      const response = await fetch('/api/offers/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId: existingOffer.id,
          offerAmount: savedOffer.offerAmount,
          availabilityDates: nextDates,
          availabilitySlots: nextSlots,
        }),
      })
      const data = await readWrite(response, 'Η ημερομηνία δεν προστέθηκε')
      if (!data) return

      setExistingOffer(data.offer)
      setSavedOffer((prev) => prev && { ...prev, availabilityDates: nextDates, availabilitySlots: nextSlots })
      setSelectedDates((prev) =>
        prev.some((d) => format(d, 'yyyy-MM-dd') === dateStr) ? prev : [...prev, toDate(dateStr)]
      )
      setAvailabilitySlots((prev) => ({ ...prev, [dateStr]: prev[dateStr] ?? [...dayHours] }))
      showToast({
        type: 'success',
        title: 'Η ημερομηνία προστέθηκε',
        message: 'Η ημερομηνία προστέθηκε στη διαθεσιμότητά σας.',
        duration: 2000,
      })
    } catch (error) {
      console.error('Error updating availability:', error)
      showToast({ type: 'error', title: 'Η ημερομηνία δεν προστέθηκε', message: 'Δοκιμάστε ξανά.' })
    }
  })

  const handleOfferAmountChange = (value: string) => {
    setOfferAmount(parseInt(value) || 0)
  }

  // Hours count as a change too — otherwise closing one hour left the update
  // button disabled and the edit could never be saved.
  const hasChanges = () => {
    if (!savedOffer) return true
    if (offerAmount !== savedOffer.offerAmount) return true
    if (!sameList(selectedBenefits, savedOffer.benefits)) return true
    if (!sameList(selectedDateStrings, savedOffer.availabilityDates)) return true
    return slotsKey(cleanSlots) !== slotsKey(savedOffer.availabilitySlots)
  }

  const handleSendOffer = async () => {
    if (offerAmount <= 0) {
      showToast({
        type: 'error',
        title: 'Ατελής συμπλήρωση',
        message: 'Παρακαλώ συμπληρώστε το πεδίο «Ποσό Προσφοράς»',
        duration: 4000
      })
      return
    }

    const dates = selectedDateStrings.filter((d) => !isPastAthensDate(d))
    if (dates.length === 0) {
      showToast({
        type: 'error',
        title: 'Ατελής συμπλήρωση',
        message: 'Παρακαλώ επιλέξτε τουλάχιστον μία ημερομηνία διαθεσιμότητας',
        duration: 4000
      })
      return
    }

    // A day with every hour closed would reach the customer as a bookable date
    // with nothing to book. Make the garage either reopen an hour or drop the
    // day, rather than silently sending a dead option.
    const emptyDates = datesWithNoHours(cleanSlots, dates)
    if (emptyDates.length > 0) {
      showToast({
        type: 'error',
        title: 'Ημέρα χωρίς ώρες',
        message: `Έκλεισες όλες τις ώρες σε ${emptyDates.length === 1 ? 'μία ημερομηνία' : `${emptyDates.length} ημερομηνίες`}. Άνοιξε τουλάχιστον μία ώρα ή αφαίρεσε την ημερομηνία.`,
        duration: 5000
      })
      return
    }

    // An untouched column means "every hour open", so it is sent as exactly
    // that. Left out, the client would book the day with no hour at all.
    const slots = fillMissingSlots(sanitizeSlots(cleanSlots, dates), dates, dayHours)

    try {
      const response = existingOffer
        ? await fetch('/api/offers/', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              offerId: existingOffer.id,
              offerAmount,
              benefits: selectedBenefits,
              availabilityDates: dates,
              availabilitySlots: slots,
            }),
          })
        : await fetch('/api/offers/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              serviceRequestId: requestId,
              offerAmount,
              benefits: selectedBenefits,
              availabilityDates: dates,
              availabilitySlots: slots,
            }),
          })

      const data = await readWrite(
        response,
        existingOffer ? 'Σφάλμα ενημέρωσης' : 'Σφάλμα αποστολής'
      )
      if (!data) return

      applyOffer(data.offer)
      showToast({
        type: 'success',
        title: existingOffer ? 'Η προσφορά ενημερώθηκε' : 'Η προσφορά στάλθηκε',
        message: existingOffer
          ? 'Ο πελάτης βλέπει πλέον τη νέα σας προσφορά.'
          : 'Θα ειδοποιηθεί ο πελάτης.',
        duration: 3000
      })
      navigate(offersHref)
    } catch (error) {
      console.error('Error sending offer:', error)
      showToast({
        type: 'error',
        title: 'Σφάλμα συστήματος',
        message: 'Παρουσιάστηκε απροσδόκητο σφάλμα. Παρακαλώ δοκιμάστε ξανά.',
        duration: 5000
      })
    }
  }

  const isSubmitting = isPending('submit') || isNavigating(offersHref)
  const canSubmit = !isSubmitting && (!existingOffer || hasChanges())

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

  if (inactive) {
    return (
      <div className={styles.pageCenter}>
        <div className="text-center max-w-sm px-5">
          <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
            <Icon name="hourglass_top" filled size="lg" className="text-amber-600" />
          </div>
          <h2 className={`${styles.sectionTitle} mb-2`}>Ο λογαριασμός σας εξετάζεται</h2>
          <p className={`${styles.bodyText} mb-6`}>
            Θα βλέπετε αιτήματα και θα στέλνετε προσφορές μόλις εγκριθεί το συνεργείο σας.
          </p>
          <button
            onClick={() => navigate(dashboardHref)}
            disabled={isNavigating(dashboardHref)}
            className={`${styles.btnOutline} mx-auto`}
          >
            {isNavigating(dashboardHref) ? <Spinner size="sm" /> : <Icon name="arrow_back" size="sm" />}
            Κατάσταση αίτησης
          </button>
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
            onClick={() => navigate(backHref)}
            disabled={isNavigating(backHref)}
            className={`${styles.btnOutline} mx-auto`}
          >
            {isNavigating(backHref) ? <Spinner size="sm" /> : <Icon name="arrow_back" size="sm" />}
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
              onClick={() => navigate(backHref)}
              disabled={isNavigating(backHref)}
              aria-label="Επιστροφή"
              className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center hover:bg-surface-container-highest transition-colors active:scale-95 disabled:opacity-70"
            >
              {isNavigating(backHref)
                ? <Spinner size="sm" className="text-on-surface" />
                : <Icon name="arrow_back" size="sm" className="text-on-surface" />}
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-on-surface">
                {!existingOffer ? 'Νέα Προσφορά' : readOnly ? 'Η προσφορά σας' : 'Ενημέρωση Προσφοράς'}
              </h1>
              <p className="text-xs text-secondary">
                {[
                  [serviceRequest.vehicle?.brand, serviceRequest.vehicle?.model].filter(Boolean).join(' '),
                  clientName,
                ].filter(Boolean).join(' — ')}
              </p>
            </div>
            {!isAccepted && (
              <button
                onClick={() => navigate(chatHref)}
                disabled={isNavigating(chatHref)}
                aria-label="Άνοιγμα συνομιλίας"
                className="w-10 h-10 rounded-full machined-gradient flex items-center justify-center shadow-lg shadow-primary/20 active:scale-95 transition-transform disabled:opacity-70"
              >
                {isNavigating(chatHref)
                  ? <Spinner size="sm" className="text-on-primary" />
                  : <Icon name="chat" size="sm" className="text-on-primary" filled />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-3xl mx-auto px-5 md:px-8 py-6 space-y-5">

        {/* Confidentiality notice — GDPR obligation reminder for garages */}
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3">
          <Icon name="shield_lock" className="text-amber-700 mt-0.5 flex-shrink-0" size="sm" />
          <div className="flex-1">
            <p className="text-xs font-bold text-amber-900 mb-1">Εμπιστευτικά στοιχεία πελάτη</p>
            <p className="text-xs text-amber-800 leading-snug">
              Τα στοιχεία επικοινωνίας και οχήματος του πελάτη είναι εμπιστευτικά και προστατεύονται από τον GDPR. Επιτρέπεται η χρήση τους <strong>μόνο</strong> για το συγκεκριμένο αίτημα service. Απαγορεύεται η αποθήκευση, η χρήση για marketing ή η μεταβίβαση σε τρίτους.
            </p>
          </div>
        </div>

        {/* Booked appointment — first thing the winning garage needs to see. */}
        {isAccepted && existingOffer?.appointmentDate && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
              <Icon name="event_available" filled size="md" className="text-green-700" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-green-700">Ραντεβού</p>
              <p className="text-base font-bold text-green-900">
                {formatAppointment(existingOffer.appointmentDate, existingOffer.appointmentTime)}
              </p>
            </div>
          </div>
        )}

        {/* Client Details Section */}
        <div className={styles.card}>
          <p className={`${styles.labelUpper} mb-4`}>Στοιχεία Πελάτη</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0">
                <Icon name="person" size="sm" className="text-primary" filled />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                  {serviceRequest.client?.lastName ? 'Ονοματεπώνυμο' : 'Όνομα'}
                </p>
                <p className="text-sm font-bold text-on-surface">{clientName}</p>
              </div>
            </div>
            {serviceRequest.client?.phoneNumber && (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0">
                  <Icon name="call" size="sm" className="text-primary" filled />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">Τηλέφωνο</p>
                  <p className="text-sm font-bold text-on-surface">{serviceRequest.client.phoneNumber}</p>
                </div>
              </div>
            )}
            {serviceRequest.client?.email && (
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
          {!readOnly && !serviceRequest.client?.phoneNumber && (
            <p className={`${styles.smallText} mt-4`}>
              Το τηλέφωνο και τα υπόλοιπα στοιχεία του πελάτη εμφανίζονται μόλις αποδεχτεί την προσφορά σας. Μέχρι τότε, μιλήστε του μέσα από τη συνομιλία.
            </p>
          )}
        </div>

        {/* Request Details Section */}
        <ServiceVehicleCard
          serviceDescription={serviceRequest.description}
          category={serviceRequest.category}
          estimatedCost={serviceRequest.estimatedCost ?? undefined}
          vehicle={{
            brand: serviceRequest.vehicle?.brand ?? '',
            model: serviceRequest.vehicle?.model ?? '',
            engineCC: serviceRequest.vehicle?.engineCC,
            modelYear: serviceRequest.vehicle?.modelYear,
            year: serviceRequest.vehicle?.year,
            fuelType: serviceRequest.vehicle?.fuelType,
            isAutomatic: serviceRequest.vehicle?.isAutomatic,
            is4x4: serviceRequest.vehicle?.is4x4,
            isTurbo: serviceRequest.vehicle?.isTurbo,
            vinNumber: serviceRequest.vehicle?.vinNumber,
            engineNumber: serviceRequest.vehicle?.engineNumber
          }}
          photoCount={serviceRequest.photoUrls?.length || 0}
          showEstimatedCost={false}
        />

        {/* The άδεια the customer photographed — often the only place the πλαίσιο
            and the αρ. κινητήρα exist, since the form stops asking once it's there. */}
        <LicensePhotoCard url={serviceRequest.vehicle?.licensePhotoUrl} />

        {/* Photos */}
        {serviceRequest.photoUrls && serviceRequest.photoUrls.length > 0 && (
          <div className={styles.card}>
            <div className="flex items-center gap-2 mb-4">
              <Icon name="photo_library" size="md" className="text-primary" filled />
              <p className={styles.labelUpper}>Φωτογραφίες ({serviceRequest.photoUrls.length})</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {serviceRequest.photoUrls.map((url: string, index: number) => (
                <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="relative aspect-square bg-surface-container rounded-xl overflow-hidden hover:opacity-90 transition-opacity">
                  <Image
                    src={url}
                    alt={`Φωτογραφία ${index + 1}`}
                    fill
                    sizes="(max-width: 640px) 50vw, 33vw"
                    className="object-cover"
                  />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Offer Section */}
        <div className={styles.card}>
          <div className="flex items-center gap-2 mb-5">
            <Icon name="request_quote" size="md" className="text-primary" filled />
            <p className={styles.labelUpper}>Προσφορά</p>
          </div>

          {/* One field matters here — what you charge. The offer number is minted on
              save and the estimate only exists for cars we have quoted before, so both
              used to sit here as greyed-out noise ("Αυτόματα", "0 EUR"). They show only
              when they actually say something. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={`${styles.label} mb-2 block`}>
                Ποσό Προσφοράς <span className="text-tertiary">*</span>
              </label>
              <input
                type="number"
                value={offerAmount || ''}
                onChange={(e) => handleOfferAmountChange(e.target.value)}
                placeholder="Εισάγετε ποσό σε €"
                className={styles.input}
                required
                disabled={readOnly}
              />
            </div>

            {offerNumber && (
              <div>
                <label className={`${styles.label} mb-2 block`}>Αριθμός Προσφοράς</label>
                <input
                  value={offerNumber}
                  readOnly
                  className={`${styles.input} !bg-surface-container !text-secondary`}
                />
              </div>
            )}
          </div>

          {estimatedCost > 0 && (
            <p className="mt-4 text-xs text-on-surface-variant flex items-center gap-1">
              <Icon name="info" size="sm" className="text-on-surface-variant/70" />
              Ο πελάτης είδε ενδεικτική εκτίμηση από {estimatedCost}€, με βάση αντίστοιχες
              εργασίες που έχουμε αναλάβει.
            </p>
          )}
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

          {/* p-2 on narrow phones: react-day-picker's grid has a fixed minimum
              width, so a full 1rem of padding per side tipped the calendar past
              a 320px screen and made the whole page scroll sideways. */}
          <div className={`flex justify-center ${readOnly ? 'opacity-50 pointer-events-none' : ''}`}>
            <DayPicker
              mode="multiple"
              selected={selectedDates}
              onSelect={readOnly ? undefined : (dates) => setSelectedDates(dates || [])}
              locale={el}
              disabled={[
                { before: firstBookableDay },
                (date) => isWeekend(date),
                { after: lastBookableDay }
              ]}
              fromDate={firstBookableDay}
              toDate={lastBookableDay}
              className="border border-outline-variant/20 rounded-xl p-2 sm:p-4 bg-surface-container-lowest max-w-full"
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
          {selectedDateStrings.length > 0 && (
            <div className="mt-5 p-4 bg-surface-container-low rounded-xl">
              <p className={`${styles.labelUpper} mb-3`}>Επιλεγμένες Ημερομηνίες ({selectedDateStrings.length})</p>
              <div className="flex flex-wrap gap-2">
                {selectedDateStrings.map((date) => (
                  <span
                    key={date}
                    className="px-3 py-1.5 machined-gradient text-on-primary rounded-full text-xs font-bold"
                  >
                    {format(toDate(date), 'dd/MM/yyyy (EEEE)', { locale: el })}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Hourly availability. Only worth showing once there are days to
              spread the hours across. */}
          {selectedDateStrings.length > 0 && (
            <div className={`mt-5 pt-5 border-t border-outline-variant/10 ${readOnly ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="flex items-center gap-2 mb-2">
                <Icon name="schedule" size="md" className="text-primary" filled />
                <p className={styles.labelUpper}>Ώρες παραλαβής</p>
              </div>
              <p className="text-xs text-secondary mb-4">
                Ο πελάτης θα διαλέξει μία από τις διαθέσιμες ώρες.{' '}
                {workdayHours.start || workdayHours.end ? (
                  <>Βάσει του ωραρίου σου ({dayHours[0]} - {workdayHours.end || '18:00'}).</>
                ) : (
                  <>
                    Όρισε το ωράριό σου στις{' '}
                    <Link href={`/garage-dashboard/${garageId}/?tab=settings`} className="font-bold text-primary hover:underline">
                      Ρυθμίσεις
                    </Link>{' '}
                    για να προσαρμοστούν οι ώρες.
                  </>
                )}
              </p>

              <AvailabilityGrid
                dates={selectedDateStrings}
                hours={dayHours}
                value={cleanSlots}
                onChange={setAvailabilitySlots}
                disabled={readOnly}
              />
            </div>
          )}
        </div>

        {/* Client Proposed Dates Section — only days that can still be booked. */}
        {!readOnly && clientAvailabilityDates.some((d) => !isPastAthensDate(d)) && (
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
                .filter((d) => !isPastAthensDate(d))
                .sort()
                .map((date) => {
                  const alreadyAdded = selectedDateStrings.includes(date)
                  const isAdding = isPending(`client-date-${date}`)

                  return (
                    <button
                      key={date}
                      type="button"
                      disabled={alreadyAdded || isAdding}
                      onClick={() => addClientDate(date)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 flex items-center gap-1.5 ${
                        alreadyAdded
                          ? 'bg-green-100 border border-green-300 text-green-800 cursor-default'
                          : isAdding
                            ? 'bg-amber-200 border border-amber-400 text-amber-900 cursor-wait'
                            : 'bg-amber-100 border border-amber-300 text-amber-900 hover:bg-primary/10 hover:border-primary/30 hover:text-primary cursor-pointer active:scale-95'
                      }`}
                    >
                      {isAdding ? (
                        <Spinner size="sm" className="text-amber-700" />
                      ) : (
                        <Icon
                          name={alreadyAdded ? 'check_circle' : 'add_circle'}
                          size="sm"
                          filled={alreadyAdded}
                          className={alreadyAdded ? 'text-green-600' : 'text-amber-700'}
                        />
                      )}
                      {toDate(date).toLocaleDateString('el-GR', {
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

            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${readOnly ? 'pointer-events-none opacity-60' : ''}`}>
              {garage.benefits.map((benefit, index) => (
                <label
                  key={index}
                  className={`flex items-center gap-3 p-3 rounded-xl ${readOnly ? 'cursor-default' : 'cursor-pointer'} transition-all ${
                    selectedBenefits.includes(benefit)
                      ? 'bg-primary/5 border border-primary/20'
                      : 'bg-surface-container border border-transparent'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={selectedBenefits.includes(benefit)}
                    disabled={readOnly}
                    onChange={(e) =>
                      setSelectedBenefits((prev) =>
                        e.target.checked ? [...prev, benefit] : prev.filter((b) => b !== benefit)
                      )
                    }
                  />
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
              <span className={offerStatusClass(offerState)}>
                {offerStatusLabel(offerState)}
              </span>
            </div>
          </div>

          {isAccepted ? (
            <div className="mt-4 p-4 bg-green-50 border border-green-100 rounded-xl flex items-start gap-3">
              <Icon name="check_circle" filled size="md" className="text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-green-900">Η προσφορά έχει γίνει αποδεκτή</p>
                <p className="text-xs text-green-700">
                  {existingOffer?.appointmentDate
                    ? `Ο πελάτης αποδέχτηκε την προσφορά σας. Ραντεβού: ${formatAppointment(existingOffer.appointmentDate, existingOffer.appointmentTime)}.`
                    : 'Ο πελάτης αποδέχτηκε την προσφορά σας. Το ραντεβού έχει προγραμματιστεί.'}
                </p>
              </div>
            </div>
          ) : readOnly ? (
            <div className="mt-4 p-4 bg-surface-container-low border border-outline-variant/10 rounded-xl flex items-start gap-3">
              <Icon name="lock" size="md" className="text-on-surface-variant flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-on-surface">
                  {serviceRequest.status === ServiceRequestStatus.CANCELLED
                    ? 'Το αίτημα ακυρώθηκε'
                    : existingOffer
                      ? 'Η προσφορά δεν είναι πλέον ενεργή'
                      : 'Το αίτημα δεν δέχεται πλέον προσφορές'}
                </p>
                <p className="text-xs text-on-surface-variant">
                  {serviceRequest.status === ServiceRequestStatus.CANCELLED
                    ? 'Η εργασία δεν θα γίνει. Δεν χρειάζεται να κάνετε κάτι.'
                    : 'Ο πελάτης έκλεισε ραντεβού με άλλο συνεργείο.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => navigate(backHref)}
                disabled={isNavigating(backHref) || isSubmitting}
                className={`${styles.btnOutline} flex-1 justify-center`}
              >
                {isNavigating(backHref) ? <Spinner size="sm" /> : <Icon name="close" size="sm" />}
                Ακύρωση
              </button>
              <button
                onClick={() => run('submit', handleSendOffer)}
                disabled={!canSubmit}
                className={`${canSubmit || isSubmitting ? styles.btnPrimary : styles.btnDisabled} flex-1 justify-center disabled:opacity-80`}
              >
                {isSubmitting ? (
                  <>
                    <Spinner size="sm" />
                    {existingOffer ? 'Ενημέρωση…' : 'Αποστολή…'}
                  </>
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
    </div>
  )
}
