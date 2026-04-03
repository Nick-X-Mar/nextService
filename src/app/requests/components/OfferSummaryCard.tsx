'use client'

import Icon from '@/components/ui/Icon'
import { OfferStatus } from '../../../types/statuses'

interface OfferSummaryOffer {
  id: string
  offerAmount: number
  appointmentPrice?: number
  status?: OfferStatus
  benefits?: string[]
  garage?: {
    companyName?: string
    address?: string
    benefits?: string[]
  } | null
}

interface OfferSummaryCardProps {
  offer: OfferSummaryOffer
  index: number
  isLast: boolean
  onClick: () => void
}

export default function OfferSummaryCard({ offer, index, isLast, onClick }: OfferSummaryCardProps) {
  const price = offer.appointmentPrice ?? offer.offerAmount
  const isAccepted = offer.status === OfferStatus.ACCEPTED

  // Benefits: prefer offer-level, fallback to garage-level
  const benefits = (Array.isArray(offer.benefits) && offer.benefits.length > 0)
    ? offer.benefits
    : (Array.isArray(offer.garage?.benefits) && offer.garage!.benefits!.length > 0)
      ? offer.garage!.benefits!
      : []
  const benefitsCount = benefits.length

  // Extract area from address (last part after comma)
  const area = offer.garage?.address
    ? offer.garage.address.split(',').pop()?.trim() || offer.garage.address
    : 'Άγνωστη περιοχή'

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-5 py-3 bg-surface-container-lowest border border-t-0 border-outline-variant/10 transition-all duration-200 hover:bg-surface-container active:scale-[0.995] ${
        isLast ? 'rounded-b-xl' : ''
      }`}
    >
      {/* Offer icon */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
        isAccepted ? 'bg-green-100' : 'bg-primary/10'
      }`}>
        <Icon
          name={isAccepted ? 'check_circle' : 'local_offer'}
          size="sm"
          filled={isAccepted}
          className={isAccepted ? 'text-green-600' : 'text-primary'}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-on-surface truncate">
            {offer.garage?.companyName || `Προσφορά ${index + 1}`}
          </p>
          {isAccepted && (
            <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-[9px] font-bold uppercase tracking-wider flex-shrink-0">
              Αποδεκτή
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-on-surface-variant truncate flex items-center gap-1">
            <Icon name="location_on" size="sm" />
            {area}
          </p>
          {benefitsCount > 0 && (
            <span className="text-xs text-primary font-bold flex items-center gap-1 flex-shrink-0">
              <Icon name="verified" size="sm" className="text-primary" />
              Παροχές {benefitsCount}
            </span>
          )}
        </div>
      </div>

      {/* Price */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <p className="text-base font-black text-on-surface">{price}€</p>
        <Icon name="chevron_right" size="sm" className="text-on-surface-variant" />
      </div>
    </button>
  )
}
