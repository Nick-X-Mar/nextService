import { OfferStatus } from '@/types/statuses'
import { isPastAthensDate } from '@/utils/athensTime'

interface SummarisedOffer {
  offerAmount: number
  status?: string
  availabilityDates?: string[]
  createdAt?: string
}

/** Offers the client can still choose between: not lost, not withdrawn. */
export function liveOffers<T extends SummarisedOffer>(offers: T[]): T[] {
  return offers.filter((o) => o.status !== OfferStatus.REJECTED && o.status !== OfferStatus.EXPIRED)
}

/** The first day this offer can still be booked, as 'YYYY-MM-DD', or null. */
export function earliestDate(offer: SummarisedOffer): string | null {
  return (offer.availabilityDates ?? []).filter((d) => !isPastAthensDate(d)).sort()[0] ?? null
}

/**
 * What a client deciding between offers wants on one line: how many, the lowest
 * price, the soonest free day. Null with no live offer.
 */
export function offersSummary(offers: SummarisedOffer[]): { count: number; cheapest: number; soonest: string | null } | null {
  const live = liveOffers(offers)
  if (live.length === 0) return null
  const dates = live.map(earliestDate).filter((d): d is string => !!d).sort()
  return {
    count: live.length,
    cheapest: Math.min(...live.map((o) => o.offerAmount)),
    soonest: dates[0] ?? null,
  }
}

export type OfferSort = 'price' | 'date' | 'arrival'

/** Cheapest first, soonest free day first, or in the order they came in. */
export function sortOffers<T extends SummarisedOffer>(offers: T[], by: OfferSort): T[] {
  const arrival = (a: T, b: T) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
  return [...offers].sort((a, b) => {
    if (by === 'price') return a.offerAmount - b.offerAmount || arrival(a, b)
    if (by === 'date') {
      const da = earliestDate(a) ?? '9999-12-31'
      const db = earliestDate(b) ?? '9999-12-31'
      return da.localeCompare(db) || a.offerAmount - b.offerAmount
    }
    return arrival(a, b)
  })
}
