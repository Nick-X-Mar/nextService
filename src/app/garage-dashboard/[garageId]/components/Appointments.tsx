'use client'

import { useState, useEffect, useCallback } from 'react'
import { styles } from '@/styles/styles'
import { OfferStatus } from '@/types/statuses'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import { useNavigation } from '@/hooks/useNavigation'
import { getCategoryText } from '@/utils/categoryLabels'
import { ServiceRequestStatus } from '@/types/statuses'
import { isCompletionDue } from '@/types/reviews'
import CompletionModal from './CompletionModal'

interface Offer {
  id: string
  serviceRequestId: string
  price: number
  currency: string
  description: string
  status: OfferStatus
  createdAt: string
  appointmentDate?: string
  appointmentTime?: string | null
  appointmentPrice?: number
  serviceRequest: {
    id: string
    description: string
    category: string
    status?: string
    completedAt?: string
    completionOutcome?: string
    finalAmounts?: { gross: number; net: number; vat: number; vatRate: number }
    client: {
      firstName: string
      lastName: string
      phoneNumber?: string
    }
    vehicle: {
      brand: string
      model: string
      year: number
    }
  }
}

interface AppointmentsProps {
  garageId: string
}

export default function Appointments({ garageId }: AppointmentsProps) {
  const { navigate, isNavigating } = useNavigation()
  const [appointments, setAppointments] = useState<Offer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [completing, setCompleting] = useState<Offer | null>(null)

  const loadAppointments = useCallback(async () => {
    try {
      setIsLoading(true)

      const response = await fetch(`/api/garage/offers/?garageId=${garageId}`)
      const data = await response.json()

      if (response.ok && data.success) {
        // Filter for accepted offers with appointment dates
        // Check both enum and string format for status
        const appointmentsList = data.offers.filter((offer: Offer) => {
          const isAccepted = offer.status === OfferStatus.ACCEPTED || (offer.status as string) === 'accepted'
          const hasAppointmentDate = offer.appointmentDate && offer.appointmentDate.trim() !== ''

          if (isAccepted && hasAppointmentDate) {
            console.log('Found appointment offer:', {
              id: offer.id,
              status: offer.status,
              appointmentDate: offer.appointmentDate,
              appointmentTime: offer.appointmentTime ?? null,
              serviceRequestId: offer.serviceRequestId
            })
          }

          return isAccepted && hasAppointmentDate
        })

        console.log('Total appointments found:', appointmentsList.length)

        // Sort by appointment date (earliest first)
        appointmentsList.sort((a: Offer, b: Offer) => {
          const dateA = new Date(a.appointmentDate || '').getTime()
          const dateB = new Date(b.appointmentDate || '').getTime()
          return dateA - dateB
        })

        setAppointments(appointmentsList)
      } else {
        console.error('Error loading appointments:', data.error)
        setAppointments([])
      }
    } catch (error) {
      console.error('Error loading appointments:', error)
      setAppointments([])
    } finally {
      setIsLoading(false)
    }
  }, [garageId])

  useEffect(() => {
    loadAppointments()
  }, [loadAppointments])

  const formatAppointmentDate = (dateString: string) => {
    const date = new Date(`${dateString}T00:00:00`)
    return date.toLocaleDateString('el-GR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      weekday: 'long'
    })
  }

  const isAppointmentTodayOrFuture = (dateString: string) => {
    try {
      // Handle different date formats
      let appointmentDate: Date
      if (dateString.includes('T')) {
        appointmentDate = new Date(dateString)
      } else {
        appointmentDate = new Date(`${dateString}T00:00:00`)
      }

      const today = new Date()
      today.setHours(0, 0, 0, 0)
      appointmentDate.setHours(0, 0, 0, 0)

      // Check if date is valid
      if (isNaN(appointmentDate.getTime())) {
        console.error('Invalid appointment date:', dateString)
        return false
      }

      return appointmentDate >= today
    } catch (error) {
      console.error('Error checking appointment date:', error, dateString)
      return false
    }
  }

  const chatHref = (requestId: string) => `/garage-dashboard/${garageId}/chat/${requestId}/`

  const handleChatClick = (requestId: string) => {
    navigate(chatHref(requestId))
  }

  const handleCardClick = (offer: Offer) => {
    navigate(`/garage-dashboard/${garageId}/offers/${offer.serviceRequestId}/`)
  }

  const upcomingAppointments = appointments.filter(
    (offer) => offer.appointmentDate && isAppointmentTodayOrFuture(offer.appointmentDate)
  )

  /**
   * Appointments whose slot has passed and that nobody has closed.
   *
   * These used to be dropped on the floor — the tab showed "today or later"
   * only, so a garage could not see yesterday's job at all, and there was no
   * surface anywhere in the app for confirming that work had happened. That is
   * why no request ever reached COMPLETED and the admin's commission report was
   * permanently empty.
   */
  const awaitingCompletion = appointments.filter((offer) => {
    if (!offer.appointmentDate) return false
    if (offer.serviceRequest.status !== ServiceRequestStatus.APPOINTMENT) return false
    return isCompletionDue(offer.appointmentDate, offer.appointmentTime ?? null)
  })

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className={styles.loadingSpinner}></div>
        <p className="text-sm text-secondary">Φορτωση ραντεβου...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-on-surface">
          Ραντεβού
        </h2>
        <p className="text-base text-secondary leading-relaxed mt-1">
          {upcomingAppointments.length} προγραμματισμένα ραντεβού
        </p>
      </div>

      {/* Jobs whose slot has passed and that nobody has closed yet. Kept above
          the upcoming list because it is the only thing here that is actually
          waiting on the garage. */}
      {awaitingCompletion.length > 0 && (
        <section className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="task_alt" size="md" className="text-primary" />
            <h3 className="text-lg font-bold text-on-surface">Περιμένουν ολοκλήρωση</h3>
          </div>
          <p className="text-sm text-secondary mb-4">
            Πες μας αν έγινε η επισκευή και τι χρέωσες. Χρειάζεται για την εκκαθάριση.
          </p>
          <div className="space-y-3">
            {awaitingCompletion.map((offer) => (
              <div
                key={offer.id}
                className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-container-lowest p-3 border border-outline-variant/10"
              >
                <div className="flex-1 min-w-[160px]">
                  <p className="text-sm font-bold text-on-surface">
                    {offer.serviceRequest.vehicle?.brand} {offer.serviceRequest.vehicle?.model}
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    {offer.appointmentDate && formatAppointmentDate(offer.appointmentDate)}
                    {offer.appointmentTime ? `, ${offer.appointmentTime}` : ''}
                    {' · '}
                    {offer.serviceRequest.client?.firstName} {offer.serviceRequest.client?.lastName}
                  </p>
                </div>
                <button
                  onClick={() => setCompleting(offer)}
                  className="bg-gradient-to-br from-primary to-primary-container text-on-primary px-4 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 active:scale-95 shadow-lg shadow-primary/20 flex items-center gap-2"
                >
                  <Icon name="check_circle" size="sm" />
                  Δήλωσε το
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Appointments List */}
      {upcomingAppointments.length === 0 ? (
        <article className="bg-surface-container-lowest rounded-xl p-6 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10">
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center mx-auto mb-4">
              <Icon name="calendar_month" size="lg" className="text-outline" />
            </div>
            <h3 className="text-2xl font-bold tracking-tight text-on-surface mb-2">
              Δεν υπαρχουν ραντεβου
            </h3>
            <p className="text-base text-secondary leading-relaxed">
              Δεν εχετε προγραμματισμενα ραντεβου απο σημερα και μετα.
            </p>
          </div>
        </article>
      ) : (
        <div className="space-y-4">
          {upcomingAppointments.map((offer) => (
            <article
              key={offer.id}
              className="bg-surface-container-lowest rounded-xl p-6 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10 hover:shadow-2xl hover:shadow-on-surface/5 transition-all duration-300 cursor-pointer"
              onClick={() => handleCardClick(offer)}
            >
              {/* Appointment date banner */}
              {offer.appointmentDate && (
                <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/10 rounded-xl mb-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                    <Icon name="event" filled size="md" className="text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-primary">Ημερομηνια Ραντεβου</p>
                    <p className="text-base font-bold text-on-surface">
                      {formatAppointmentDate(offer.appointmentDate)}
                      {offer.appointmentTime ? `, ${offer.appointmentTime}` : ''}
                    </p>
                  </div>
                </div>
              )}

              {/* Status + Price row */}
              <div className="flex items-start justify-between mb-4">
                <span className="text-[0.65rem] font-black uppercase tracking-[0.1em] text-blue-700 bg-blue-100 px-2 py-1 rounded-sm">
                  {getCategoryText(offer.serviceRequest.category)}
                </span>
                <div className="text-right">
                  <p className="text-2xl font-black text-primary tracking-tight">
                    {typeof offer.appointmentPrice === 'number'
                      ? offer.appointmentPrice
                      : offer.price}{' '}
                    <span className="text-sm font-bold text-on-surface-variant">{offer.currency || 'EUR'}</span>
                  </p>
                </div>
              </div>

              {/* Vehicle Spec Bento Grid */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-surface-container p-2 rounded-lg flex flex-col items-center justify-center">
                  <span className="text-[9px] font-black uppercase text-outline opacity-70">Μαρκα</span>
                  <span className="text-xs font-bold text-on-surface">{offer.serviceRequest.vehicle.brand}</span>
                </div>
                <div className="bg-surface-container p-2 rounded-lg flex flex-col items-center justify-center">
                  <span className="text-[9px] font-black uppercase text-outline opacity-70">Μοντελο</span>
                  <span className="text-xs font-bold text-on-surface">{offer.serviceRequest.vehicle.model}</span>
                </div>
                <div className="bg-surface-container p-2 rounded-lg flex flex-col items-center justify-center">
                  <span className="text-[9px] font-black uppercase text-outline opacity-70">Ετος</span>
                  <span className="text-xs font-bold text-on-surface">{offer.serviceRequest.vehicle.year}</span>
                </div>
              </div>

              {/* Client info bar */}
              <div className="flex items-center gap-3 p-3 bg-surface-container-low rounded-lg mb-4">
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-black uppercase">
                  {offer.serviceRequest.client.firstName?.charAt(0)}{offer.serviceRequest.client.lastName?.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-on-surface truncate">
                    {offer.serviceRequest.client.firstName} {offer.serviceRequest.client.lastName}
                  </p>
                  {offer.serviceRequest.client.phoneNumber && (
                    <p className="text-xs text-secondary truncate">{offer.serviceRequest.client.phoneNumber}</p>
                  )}
                </div>
              </div>

              {/* Offer description */}
              <div className="border-t border-outline-variant/10 pt-4 mb-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant mb-1">Περιγραφη Προσφορας</p>
                <p className="text-sm text-on-surface-variant line-clamp-2">
                  {offer.description}
                </p>
              </div>

              {/* Chat Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleChatClick(offer.serviceRequestId)
                }}
                disabled={isNavigating(chatHref(offer.serviceRequestId))}
                className="bg-gradient-to-br from-primary to-primary-container text-on-primary px-6 py-3 rounded-lg text-sm font-bold transition-all duration-200 active:scale-95 shadow-lg shadow-primary/20 flex items-center gap-2 w-full justify-center disabled:opacity-70"
              >
                {isNavigating(chatHref(offer.serviceRequestId))
                  ? <Spinner size="sm" />
                  : <Icon name="chat" size="sm" />}
                Ανοιγμα Συνομιλιας
              </button>
            </article>
          ))}
        </div>
      )}

      {completing && (
        <CompletionModal
          isOpen
          onClose={() => setCompleting(null)}
          requestId={completing.serviceRequestId}
          vehicleLabel={[
            completing.serviceRequest.vehicle?.brand,
            completing.serviceRequest.vehicle?.model,
          ]
            .filter(Boolean)
            .join(' ')}
          quotedPrice={
            typeof completing.appointmentPrice === 'number'
              ? completing.appointmentPrice
              : completing.price
          }
          onCompleted={loadAppointments}
        />
      )}
    </div>
  )
}
