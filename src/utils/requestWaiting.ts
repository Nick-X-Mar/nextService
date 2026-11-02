import { outcomeReviewStatus, type OutcomeReview } from '@/lib/commission-basis'
import type { RequestWaiting } from '@/types/adminRequests'
import { isCompletionDue, type ClientConfirmation, type CompletionOutcome } from '@/types/reviews'
import { OfferStatus, ServiceRequestStatus } from '@/types/statuses'
import { isPastAthensDate } from '@/utils/athensTime'
import { withinReviewWindow } from '@/utils/reviewLookup'

export interface WaitingRequest {
  status?: string
  createdAt?: string
  acceptedGarageId?: string
  appointmentDate?: string
  appointmentTime?: string | null
  completedAt?: string
  completionOutcome?: CompletionOutcome
  outcomeReview?: OutcomeReview
  clientConfirmation?: ClientConfirmation
}

export interface WaitingOffer {
  garageId: string
  status?: string
  createdAt?: string
  availabilityDates?: string[]
  clientAvailabilityDates?: string[]
  clientAvailabilityProposedAt?: string
}

export interface WaitingMessage {
  senderType?: string
  senderId?: string
  garageId?: string
  timestamp?: string
}

export type GarageContacts = Map<string, Record<string, unknown>>

/** The garage whose thread a message is in. A client row without one predates per-garage threads. */
export function messageThread(message: WaitingMessage): string | undefined {
  return message.senderType === 'garage' ? message.senderId : message.garageId
}

/**
 * Who a request is waiting on, for the admin deciding whom to call. It is worked
 * out from the offers, the chat and the dates rather than stored, so it can never
 * go stale, and nobody has to keep it up to date. A request can wait on several
 * sides at once, as when one garage asked the client something while another
 * quoted. An empty list means nobody has to act, as with a booked appointment
 * whose day has not come.
 *
 * The chat reading is a judgement: the last word in a thread is taken to be what
 * the other side owes an answer to, whatever it says.
 */
export function requestWaiting(
  request: WaitingRequest,
  offers: WaitingOffer[],
  messages: WaitingMessage[],
  garages: GarageContacts,
  now: Date = new Date()
): RequestWaiting[] {
  const fromGarage = (garageId: string) => ({
    garageId,
    garageName: String(garages.get(garageId)?.companyName ?? garageId),
    garagePhone: String(garages.get(garageId)?.mobile ?? ''),
  })

  if (request.status === ServiceRequestStatus.COMPLETED) {
    const items: RequestWaiting[] = []
    if (outcomeReviewStatus(request) === 'pending') {
      items.push({ on: 'admin', reason: 'Το συνεργείο δήλωσε ότι δεν έγινε: χρειάζεται έλεγχος με τον πελάτη', since: request.completedAt })
    }
    if (request.clientConfirmation?.status === 'disputed') {
      items.push({ on: 'admin', reason: 'Ο πελάτης διαφωνεί με τη δήλωση του συνεργείου', since: request.clientConfirmation.at })
    }
    if (!request.clientConfirmation && withinReviewWindow(request.completedAt, now.getTime())) {
      items.push({ on: 'client', reason: 'Να επιβεβαιώσει τη χρέωση', since: request.completedAt })
    }
    return items
  }

  if (request.status === ServiceRequestStatus.APPOINTMENT || request.status === ServiceRequestStatus.IN_PROGRESS) {
    const due = request.appointmentDate && isCompletionDue(request.appointmentDate, request.appointmentTime, now)
    if (!due) return []
    return [{
      on: 'garage',
      reason: 'Να δηλώσει αν έγινε η δουλειά',
      since: request.appointmentDate,
      ...(request.acceptedGarageId ? fromGarage(request.acceptedGarageId) : {}),
    }]
  }

  if (request.status && request.status !== ServiceRequestStatus.PENDING) return []

  const liveOffers = offers.filter((o) => o.status === OfferStatus.PENDING)
  const quoted = new Set(liveOffers.map((o) => o.garageId))
  const items: RequestWaiting[] = []

  const lastInThread = new Map<string, WaitingMessage>()
  for (const message of messages) {
    const thread = messageThread(message)
    if (!thread) continue
    const last = lastInThread.get(thread)
    if (!last || String(last.timestamp) < String(message.timestamp)) lastInThread.set(thread, message)
  }
  for (const [garageId, last] of lastInThread) {
    if (last.senderType === 'garage') {
      items.push({
        on: 'client',
        reason: `Να απαντήσει στο μήνυμα του συνεργείου ${fromGarage(garageId).garageName}`,
        since: last.timestamp,
      })
    } else {
      items.push({
        on: 'garage',
        reason: quoted.has(garageId) ? 'Να απαντήσει στον πελάτη' : 'Να απαντήσει στον πελάτη και να δώσει τιμή',
        since: last.timestamp,
        ...fromGarage(garageId),
      })
    }
  }

  let bookable = 0
  let latestBookable: string | undefined
  for (const offer of liveOffers) {
    const offered = offer.availabilityDates ?? []
    const proposed = (offer.clientAvailabilityDates ?? []).filter((date) => !isPastAthensDate(date, now))
    if (proposed.some((date) => !offered.includes(date))) {
      items.push({
        on: 'garage',
        reason: 'Να απαντήσει στις ημερομηνίες που πρότεινε ο πελάτης',
        since: offer.clientAvailabilityProposedAt,
        ...fromGarage(offer.garageId),
      })
    } else if (offered.every((date) => isPastAthensDate(date, now))) {
      items.push({
        on: 'garage',
        reason: 'Οι ημερομηνίες της προσφοράς πέρασαν: χρειάζονται νέες',
        since: offer.createdAt,
        ...fromGarage(offer.garageId),
      })
    } else {
      bookable++
      if (!latestBookable || String(latestBookable) < String(offer.createdAt)) latestBookable = offer.createdAt
    }
  }
  if (bookable > 0) {
    items.push({
      on: 'client',
      reason: bookable === 1 ? 'Να αποδεχτεί την προσφορά και να κλείσει ημερομηνία' : `Να διαλέξει μία από τις ${bookable} προσφορές και ημερομηνία`,
      since: latestBookable,
    })
  }

  if (items.length === 0) {
    items.push({ on: 'garage', reason: 'Κανένα συνεργείο δεν έχει απαντήσει ακόμα', since: request.createdAt })
  }
  return items
}
