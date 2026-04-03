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
  clientAvailabilityDates?: string[]
  serviceRequest: {
    id: string
    description: string
    category: string
    client: {
      firstName: string
      lastName: string
    }
    vehicle: {
      brand: string
      model: string
      year: number
    }
  }
}

interface MyOffersProps {
  garageId: string
}

export default function MyOffers({ garageId }: MyOffersProps) {
  const router = useRouter()
  const [offers, setOffers] = useState<Offer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | OfferStatus>('all')

  useEffect(() => {
    loadOffers()
  }, [garageId])

  const loadOffers = async () => {
    try {
      setIsLoading(true)

      const response = await fetch(`/api/garage/offers?garageId=${garageId}`)
      const data = await response.json()

      if (response.ok && data.success) {
        setOffers(data.offers)
      } else {
        console.error('Error loading offers:', data.error)
        setOffers([])
      }
    } catch (error) {
      console.error('Error loading offers:', error)
      setOffers([])
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusStyle = (status: OfferStatus) => {
    switch (status) {
      case OfferStatus.PENDING:
        return 'text-[0.65rem] font-black uppercase tracking-[0.1em] text-primary bg-primary/10 px-2 py-1 rounded-sm'
      case OfferStatus.ACCEPTED:
        return 'text-[0.65rem] font-black uppercase tracking-[0.1em] text-green-700 bg-green-100 px-2 py-1 rounded-sm'
      case OfferStatus.REJECTED:
        return 'text-[0.65rem] font-black uppercase tracking-[0.1em] text-red-700 bg-red-100 px-2 py-1 rounded-sm'
      case OfferStatus.EXPIRED:
        return 'text-[0.65rem] font-black uppercase tracking-[0.1em] text-on-surface-variant bg-surface-container px-2 py-1 rounded-sm'
      default:
        return 'text-[0.65rem] font-black uppercase tracking-[0.1em] text-on-surface-variant bg-surface-container px-2 py-1 rounded-sm'
    }
  }

  const getStatusText = (status: OfferStatus) => {
    switch (status) {
      case OfferStatus.PENDING:
        return 'Εκκρεμης'
      case OfferStatus.ACCEPTED:
        return 'Αποδεκτη'
      case OfferStatus.REJECTED:
        return 'Απορριφθηκε'
      case OfferStatus.EXPIRED:
        return 'Εληξε'
      default:
        return status
    }
  }

  const getStatusIcon = (status: OfferStatus) => {
    switch (status) {
      case OfferStatus.PENDING:
        return 'schedule'
      case OfferStatus.ACCEPTED:
        return 'check_circle'
      case OfferStatus.REJECTED:
        return 'cancel'
      case OfferStatus.EXPIRED:
        return 'timer_off'
      default:
        return 'help'
    }
  }

  const handleOfferClick = (offer: Offer) => {
    router.push(`/garage-dashboard/${garageId}/offers/${offer.serviceRequestId}`)
  }

  const filteredOffers = offers.filter(offer => {
    // Exclude accepted offers with appointmentDate (they should be in Appointments tab)
    if (offer.status === OfferStatus.ACCEPTED && offer.appointmentDate) {
      return false
    }

    if (filter === 'all') return true
    return offer.status === filter
  })

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className={styles.loadingSpinner}></div>
        <p className="text-sm text-secondary">Φορτωση προσφορων...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-on-surface">
          Οι Προσφορες μου
        </h2>
        <p className="text-base text-secondary leading-relaxed mt-1">
          {filteredOffers.length} προσφορες συνολικα
        </p>
      </div>

      {/* Filter Chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
        {(['all', OfferStatus.PENDING, OfferStatus.REJECTED] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={filter === status
              ? 'bg-primary text-on-primary px-5 py-2 rounded-full text-sm font-bold whitespace-nowrap'
              : 'bg-secondary-container text-on-secondary-container px-5 py-2 rounded-full text-sm font-bold whitespace-nowrap hover:bg-surface-container-high transition-colors cursor-pointer'
            }
          >
            {status === 'all' ? 'Ολες' : getStatusText(status)}
          </button>
        ))}
      </div>

      {/* Offers List */}
      {filteredOffers.length === 0 ? (
        <article className="bg-surface-container-lowest rounded-xl p-6 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10">
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center mx-auto mb-4">
              <Icon name="description" size="lg" className="text-outline" />
            </div>
            <h3 className="text-2xl font-bold tracking-tight text-on-surface mb-2">
              Δεν υπαρχουν προσφορες
            </h3>
            <p className="text-base text-secondary leading-relaxed mb-4">
              {filter === 'all'
                ? 'Δεν εχετε κανει ακομα καμια προσφορα.'
                : `Δεν υπαρχουν προσφορες με κατασταση "${getStatusText(filter)}".`
              }
            </p>
            {filter === 'all' && (
              <button
                onClick={() => {
                  window.location.hash = 'available'
                }}
                className={styles.btnPrimary}
              >
                <Icon name="add" size="sm" />
                Δειτε Διαθεσιμα Αιτηματα
              </button>
            )}
          </div>
        </article>
      ) : (
        <div className="space-y-4">
          {filteredOffers.map((offer) => (
            <article
              key={offer.id}
              className={`bg-surface-container-lowest rounded-xl p-6 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10 transition-all duration-300 ${
                offer.status === OfferStatus.REJECTED
                  ? 'opacity-60 cursor-default'
                  : 'cursor-pointer hover:shadow-2xl hover:shadow-on-surface/5'
              }`}
              onClick={() => {
                if (offer.status !== OfferStatus.REJECTED) {
                  handleOfferClick(offer)
                }
              }}
            >
              {/* Status + Price row */}
              <div className="flex items-start justify-between mb-4">
                <span className={getStatusStyle(offer.status)}>
                  {getStatusText(offer.status)}
                </span>
                <div className="text-right">
                  <p className="text-2xl font-black text-primary tracking-tight">
                    {typeof offer.appointmentPrice === 'number'
                      ? offer.appointmentPrice
                      : offer.price}{' '}
                    <span className="text-sm font-bold text-on-surface-variant">{offer.currency}</span>
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant mt-1">
                    {new Date(offer.createdAt).toLocaleDateString('el-GR')}
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
                  <p className="text-xs text-secondary truncate">{offer.serviceRequest.category}</p>
                </div>
                <Icon name={getStatusIcon(offer.status)} filled size="sm" className={
                  offer.status === OfferStatus.PENDING ? 'text-primary' :
                  offer.status === OfferStatus.ACCEPTED ? 'text-green-600' :
                  offer.status === OfferStatus.REJECTED ? 'text-tertiary' : 'text-secondary'
                } />
              </div>

              {/* Client proposed dates notification */}
              {offer.clientAvailabilityDates && offer.clientAvailabilityDates.length > 0 && offer.status === OfferStatus.PENDING && (
                <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4 animate-pulse-subtle">
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <Icon name="event_note" filled size="sm" className="text-amber-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-amber-900">
                      Ο πελάτης πρότεινε {offer.clientAvailabilityDates.length} νέες ημερομηνίες
                    </p>
                    <p className="text-[10px] text-amber-700">
                      Πατήστε για να δείτε τις προτεινόμενες ημερομηνίες
                    </p>
                  </div>
                  <Icon name="arrow_forward" size="sm" className="text-amber-600 flex-shrink-0" />
                </div>
              )}

              {/* Offer description */}
              <div className="border-t border-outline-variant/10 pt-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant mb-1">Περιγραφη Προσφορας</p>
                <p className="text-sm text-on-surface-variant line-clamp-2">
                  {offer.description}
                </p>
                {offer.status === OfferStatus.ACCEPTED && offer.appointmentDate && (
                  <div className="flex items-center gap-2 mt-3 p-2 bg-green-50 rounded-lg">
                    <Icon name="event" filled size="sm" className="text-green-700" />
                    <span className="text-xs font-bold text-green-700">
                      {new Date(`${offer.appointmentDate}T00:00:00`).toLocaleDateString('el-GR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        weekday: 'long'
                      })}
                    </span>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
