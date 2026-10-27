import { OfferStatus, ServiceRequestStatus } from '@/types/statuses'
import { styles } from '@/styles/styles'
import { athensDaysUntil } from '@/utils/athensTime'

/**
 * What an offer amounts to for the garage that made it: an offer status, or
 * 'cancelled' when the request itself was called off.
 */
export type GarageOfferState = OfferStatus | 'cancelled'

/**
 * Reads an offer's status together with its request's, which is what the
 * garage screens must show — never the offer's own flag alone:
 *
 * - On a cancelled request the offer is "Ακυρώθηκε", not "Απορρίφθηκε": the
 *   client (or an admin) called the job off, nobody turned the quote down.
 *   The exception is an offer that had already lost to another garage before
 *   the cancel, when the request says so.
 * - A pending flag on a request that has moved on is stale. Closing the
 *   competing offers reads an index that can lag a just-written offer, so an
 *   offer can stay "pending" on a job another garage won; it lost all the same.
 */
export function garageOfferState(
  status: string | null | undefined,
  request?: { status?: string | null; acceptedOfferId?: string | null } | null,
  offerId?: string | null
): GarageOfferState | string | null | undefined {
  const requestStatus = request?.status
  if (!status || !requestStatus) return status
  if (requestStatus === ServiceRequestStatus.CANCELLED) {
    const lostBeforeTheCancel =
      status === OfferStatus.REJECTED &&
      !!offerId &&
      !!request?.acceptedOfferId &&
      request.acceptedOfferId !== offerId
    return lostBeforeTheCancel || status === OfferStatus.EXPIRED ? status : 'cancelled'
  }
  if (status === OfferStatus.PENDING && requestStatus !== ServiceRequestStatus.PENDING) {
    return OfferStatus.REJECTED
  }
  return status
}

/** How an offer's status reads to the garage that made it — pass it through `garageOfferState` first. */
export function offerStatusLabel(status?: GarageOfferState | string | null): string {
  switch (status) {
    case OfferStatus.PENDING:
      return 'Εκκρεμής'
    case OfferStatus.ACCEPTED:
      return 'Αποδεκτή'
    case OfferStatus.REJECTED:
      return 'Απορρίφθηκε'
    case OfferStatus.EXPIRED:
      return 'Έληξε'
    case 'cancelled':
      return 'Ακυρώθηκε'
    default:
      return 'Δεν έχει σταλεί'
  }
}

export function offerStatusClass(status?: GarageOfferState | string | null): string {
  switch (status) {
    case OfferStatus.PENDING:
      return styles.statusPending
    case OfferStatus.ACCEPTED:
      return styles.statusCompleted
    case OfferStatus.REJECTED:
    case 'cancelled':
      return styles.statusCancelled
    default:
      return 'text-[0.65rem] font-black uppercase tracking-[0.1em] text-on-surface-variant bg-surface-container px-2 py-1 rounded-sm'
  }
}

export function offerStatusIcon(status?: GarageOfferState | string | null): string {
  switch (status) {
    case OfferStatus.PENDING:
      return 'schedule'
    case OfferStatus.ACCEPTED:
      return 'check_circle'
    case OfferStatus.REJECTED:
      return 'cancel'
    case OfferStatus.EXPIRED:
      return 'timer_off'
    case 'cancelled':
      return 'event_busy'
    default:
      return 'help'
  }
}

/** 'Τρίτη 15/09/2026' for an Athens 'YYYY-MM-DD'. */
export function formatAppointmentDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('el-GR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** 'Τρίτη 15/09/2026, 11:00' — the hour only when the booking has one. */
export function formatAppointment(date: string, time?: string | null): string {
  return time ? `${formatAppointmentDate(date)}, ${time}` : formatAppointmentDate(date)
}

/**
 * A booking the garage still has ahead of it: accepted, dated from Athens'
 * today onwards (not the device's — a phone in another zone, or the hour after
 * midnight, used to file today's job under the past), and not since closed.
 * Shared by the Appointments tab and its badge so the two always agree.
 */
export function isUpcomingAppointment(offer: {
  status?: string
  appointmentDate?: string
  serviceRequest?: { status?: string } | null
}): boolean {
  if (offer.status !== OfferStatus.ACCEPTED || !offer.appointmentDate) return false
  const requestStatus = offer.serviceRequest?.status
  if (requestStatus === ServiceRequestStatus.COMPLETED || requestStatus === ServiceRequestStatus.CANCELLED) {
    return false
  }
  return (athensDaysUntil(offer.appointmentDate) ?? -1) >= 0
}
