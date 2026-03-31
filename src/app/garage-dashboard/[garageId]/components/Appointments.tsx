'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { styles } from '@/styles/styles'
import { OfferStatus } from '@/types/statuses'
import Icon from '@/components/ui/Icon'

interface Offer {
  id: string
  serviceRequestId: string
  price: number
  currency: string
  description: string
  status: OfferStatus
  createdAt: string
  appointmentDate?: string
  appointmentPrice?: number
  serviceRequest: {
    id: string
    description: string
    category: string
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
  const router = useRouter()
  const [appointments, setAppointments] = useState<Offer[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadAppointments()
  }, [garageId])

  const loadAppointments = async () => {
    try {
      setIsLoading(true)

      const response = await fetch(`/api/garage/offers?garageId=${garageId}`)
      const data = await response.json()

      if (response.ok && data.success) {
        // Filter for accepted offers with appointment dates
        // Check both enum and string format for status
        const appointmentsList = data.offers.filter((offer: any) => {
          const isAccepted = offer.status === OfferStatus.ACCEPTED || offer.status === 'accepted'
          const hasAppointmentDate = offer.appointmentDate && offer.appointmentDate.trim() !== ''

          if (isAccepted && hasAppointmentDate) {
            console.log('Found appointment offer:', {
              id: offer.id,
              status: offer.status,
              appointmentDate: offer.appointmentDate,
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
  }

  const getCategoryText = (category: string) => {
    switch (category) {
      case 'service':
        return 'Συντηρηση'
      case 'brakes':
        return 'Φρενα'
      case 'tires':
        return 'Λαστιχα'
      case 'engine':
        return 'Κινητηρας'
      case 'electrical':
        return 'Ηλεκτρικα'
      case 'oils':
        return 'Λαδια'
      default:
        return category
    }
  }

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

  const handleChatClick = (requestId: string) => {
    router.push(`/garage-dashboard/${garageId}/chat/${requestId}`)
  }

  const handleCardClick = (offer: Offer) => {
    router.push(`/garage-dashboard/${garageId}/offers/${offer.serviceRequestId}`)
  }

  // Filter to show only today and future appointments
  const upcomingAppointments = appointments.filter(offer => {
    if (!offer.appointmentDate) return false
    const isUpcoming = isAppointmentTodayOrFuture(offer.appointmentDate)
    if (!isUpcoming) {
      console.log('Filtered out past appointment:', {
        id: offer.id,
        appointmentDate: offer.appointmentDate
      })
    }
    return isUpcoming
  })

  console.log('Upcoming appointments count:', upcomingAppointments.length, 'out of', appointments.length)

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
          Ραντεβου
        </h2>
        <p className="text-base text-secondary leading-relaxed mt-1">
          {upcomingAppointments.length} προγραμματισμενα ραντεβου
        </p>
      </div>

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
                className="bg-gradient-to-br from-primary to-primary-container text-on-primary px-6 py-3 rounded-lg text-sm font-bold transition-all duration-200 active:scale-95 shadow-lg shadow-primary/20 flex items-center gap-2 w-full justify-center"
              >
                <Icon name="chat" size="sm" />
                Ανοιγμα Συνομιλιας
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
