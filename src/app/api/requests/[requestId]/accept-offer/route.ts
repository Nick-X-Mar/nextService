import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb'
import { isValidTime, isSlotAvailable, slotsForDate, type AvailabilitySlots } from '@/utils/availabilitySlots'
import { athensDateTime, isPastAthensDate } from '@/utils/athensTime'
import { ServiceRequestStatus, OfferStatus } from '@/types/statuses'
import { logEvent } from '@/utils/eventLogger'
import { sendEmail } from '@/utils/emailService'
import { EventName, EmailTemplate } from '@/types/events'
import { getStripe, DEPOSIT_PERCENT } from '@/lib/stripe-server'
import { requireClient } from '@/utils/requireAuth'
import { generatePresignedUrls, presignPhotoRecords } from '@/utils/s3Service'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'
import { broadcastRequestUpdate } from '@/utils/requestBroadcast'
import { invalidateUnread } from '@/utils/unreadCache'
import { rejectPendingOffersOn } from '@/app/api/offers/offerWrites'

const checkAcceptRate = createRateLimiter('accept-offer', 5, 3600000)

/** Cents, so a figure that went through a float never fails an equality on a rounding residue. */
const toCents = (euros: number) => Math.round(euros * 100)

/**
 * The garage re-priced its offer after the client loaded it. The client is
 * told the new figure and has to accept again — never booked at a price it
 * did not see.
 */
function offerAmountChanged(currentAmount: number) {
  return NextResponse.json(
    {
      success: false,
      code: 'OFFER_AMOUNT_CHANGED',
      offerAmount: currentAmount,
      error: `Η προσφορά άλλαξε: το συνεργείο ενημέρωσε την τιμή σε ${currentAmount.toLocaleString('el-GR')} €. Ελέγξτε τη νέα τιμή και αποδεχτείτε ξανά.`,
    },
    { status: 409 }
  )
}

const OFFER_UNAVAILABLE = {
  success: false,
  code: 'OFFER_UNAVAILABLE',
  error: 'Η προσφορά δεν είναι πλέον διαθέσιμη.',
}

const GARAGE_UNAVAILABLE = {
  success: false,
  code: 'GARAGE_UNAVAILABLE',
  error: 'Το συνεργείο δεν δέχεται πλέον ραντεβού μέσω της πλατφόρμας. Επιλέξτε άλλη προσφορά.',
}

// The transaction was cancelled by a concurrent write to the same rows, with
// no condition failing — nothing has changed, it only has to be resent.
const ACCEPT_CONFLICT = {
  success: false,
  code: 'WRITE_CONFLICT',
  error: 'Το αίτημα ενημερωνόταν την ίδια στιγμή. Δοκιμάστε ξανά.',
}

/** Why a request that is no longer open cannot take an acceptance. */
function closedRequestMessage(status: unknown): string {
  switch (status) {
    case ServiceRequestStatus.CANCELLED:
      return 'Το αίτημα έχει ακυρωθεί.'
    case ServiceRequestStatus.COMPLETED:
      return 'Το αίτημα έχει ήδη ολοκληρωθεί.'
    default:
      return 'Έχετε ήδη αποδεχτεί προσφορά για αυτό το αίτημα.'
  }
}

async function _PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params

    if (!requestId) {
      return NextResponse.json(
        { success: false, error: 'Request ID is required' },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => null)
    const { offerId, appointmentDate, appointmentTime, paymentIntentId } = body || {}
    // The price the client was looking at when it pressed accept — older
    // clients send it as `appointmentPrice`. It is never what gets booked (that
    // is the garage's stored figure); it is only compared against it, so a
    // garage that re-priced in the meantime cannot have the client booked at a
    // number it never saw.
    const rawExpected = body?.expectedAmount ?? body?.appointmentPrice
    const expectedAmount = rawExpected === undefined || rawExpected === null ? null : Number(rawExpected)

    const paymentsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true'

    if (!offerId || typeof offerId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'offerId is required' },
        { status: 400 }
      )
    }

    if (!appointmentDate || typeof appointmentDate !== 'string') {
      return NextResponse.json(
        { success: false, error: 'appointmentDate is required' },
        { status: 400 }
      )
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(appointmentDate)) {
      return NextResponse.json(
        { success: false, error: 'appointmentDate must be in format YYYY-MM-DD' },
        { status: 400 }
      )
    }

    // Also refuses dates that only look valid ('2026-02-31'), which a plain
    // Date parse would silently roll over into March.
    if (!athensDateTime(appointmentDate, '00:00')) {
      return NextResponse.json(
        { success: false, error: 'appointmentDate is not a valid date' },
        { status: 400 }
      )
    }

    if (expectedAmount !== null && (!Number.isFinite(expectedAmount) || expectedAmount <= 0)) {
      return NextResponse.json(
        { success: false, error: 'expectedAmount must be a positive number' },
        { status: 400 }
      )
    }

    if (appointmentTime !== undefined && !isValidTime(appointmentTime)) {
      return NextResponse.json(
        { success: false, error: 'appointmentTime must be in format HH:MM' },
        { status: 400 }
      )
    }

    // An appointment in the past can never happen, and it would land straight
    // in the garage's "did the job happen?" queue. Judged in Athens time,
    // because that is the zone appointment dates are written in.
    if (isPastAthensDate(appointmentDate)) {
      return NextResponse.json(
        { success: false, error: 'Η ημερομηνία του ραντεβού έχει περάσει.' },
        { status: 400 }
      )
    }
    if (appointmentTime) {
      const startsAt = athensDateTime(appointmentDate, appointmentTime)
      if (!startsAt || startsAt.getTime() <= Date.now()) {
        return NextResponse.json(
          { success: false, error: 'Η ώρα του ραντεβού έχει περάσει. Επιλέξτε άλλη ώρα.' },
          { status: 400 }
        )
      }
    }

    // Authorization: only the owning client can accept an offer
    const clientId = requireClient(request)
    if (clientId instanceof NextResponse) return clientId

    if (!checkAcceptRate(clientId)) {
      return NextResponse.json(
        { error: 'Πολλές προσπάθειες. Δοκιμάστε ξανά σε 1 ώρα.' },
        { status: 429 }
      )
    }

    const fetchRes = await dynamoDB.send(
      new GetCommand({ TableName: 'ServiceRequests', Key: { id: requestId } })
    )
    const serviceRequest = fetchRes.Item

    if (!serviceRequest) {
      return NextResponse.json(
        { success: false, error: 'Service request not found' },
        { status: 404 }
      )
    }

    if (clientId !== serviceRequest.clientId) {
      return NextResponse.json(
        { success: false, error: 'Δεν έχετε πρόσβαση σε αυτόν τον πόρο' },
        { status: 403 }
      )
    }

    // Only an open request can take an acceptance. Without this a stale tab
    // could reopen a cancelled request, switch an existing appointment to a
    // different garage, or drag a completed job back to APPOINTMENT. The same
    // condition is enforced again at write time below; this read only exists
    // to give a precise message in the common case.
    if (serviceRequest.status !== ServiceRequestStatus.PENDING || serviceRequest.acceptedOfferId) {
      return NextResponse.json(
        { success: false, error: closedRequestMessage(serviceRequest.status) },
        { status: 409 }
      )
    }

    // The winning offer decides which garage keeps access to this job, so it is
    // read before anything is written rather than inferred afterwards.
    const acceptedOfferRes = await dynamoDB.send(
      new GetCommand({ TableName: 'Offers', Key: { id: offerId } })
    )
    const acceptedOffer = acceptedOfferRes.Item
    if (!acceptedOffer || acceptedOffer.serviceRequestId !== requestId) {
      return NextResponse.json(
        { success: false, error: 'Offer not found for this request' },
        { status: 404 }
      )
    }
    if (acceptedOffer.status !== OfferStatus.PENDING) {
      return NextResponse.json(OFFER_UNAVAILABLE, { status: 409 })
    }
    // Every booking belongs to a garage: it is who completes the job, who is
    // billed the commission, and whose active flag is checked at write time.
    const acceptedGarageId = typeof acceptedOffer.garageId === 'string' ? acceptedOffer.garageId : null
    if (!acceptedGarageId) {
      return NextResponse.json(OFFER_UNAVAILABLE, { status: 409 })
    }

    // The garage dashboard, both confirmation emails and the commission
    // fallback all read the price stored here, so it is the garage's own
    // figure. Older offers stored it as a string, hence the coercion.
    const agreedPrice = Number(acceptedOffer.offerAmount)
    if (!Number.isFinite(agreedPrice) || agreedPrice <= 0) {
      return NextResponse.json(
        { success: false, error: 'Η προσφορά δεν έχει έγκυρο ποσό.' },
        { status: 409 }
      )
    }
    if (expectedAmount !== null && toCents(expectedAmount) !== toCents(agreedPrice)) {
      return offerAmountChanged(agreedPrice)
    }

    // The date and hour have to be ones this garage actually offered. Without
    // this the client controls the appointment entirely and could book a day
    // or a time the shop is closed.
    const offeredDates = (acceptedOffer.availabilityDates as string[] | undefined) ?? []
    if (offeredDates.length > 0 && !offeredDates.includes(appointmentDate)) {
      return NextResponse.json(
        { success: false, error: 'Η ημερομηνία δεν είναι διαθέσιμη σε αυτή την προσφορά' },
        { status: 400 }
      )
    }

    const offeredSlots = acceptedOffer.availabilitySlots as AvailabilitySlots | undefined
    const hoursForDate = slotsForDate(offeredSlots, appointmentDate)
    // hoursForDate === null means the offer predates slots and books by day.
    if (hoursForDate !== null && hoursForDate.length > 0) {
      if (!appointmentTime) {
        return NextResponse.json(
          { success: false, error: 'Επιλέξτε ώρα για το ραντεβού' },
          { status: 400 }
        )
      }
      if (!isSlotAvailable(offeredSlots, appointmentDate, appointmentTime)) {
        return NextResponse.json(
          { success: false, error: 'Η ώρα δεν είναι διαθέσιμη σε αυτή την προσφορά' },
          { status: 400 }
        )
      }
    }

    // Verify payment if payments are enabled
    let depositAmount: number | null = null
    let remainingAmount: number | null = null

    if (paymentsEnabled) {
      if (!paymentIntentId) {
        return NextResponse.json(
          { success: false, error: 'Payment is required to accept this offer' },
          { status: 400 }
        )
      }

      const stripe = getStripe()
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

      if (paymentIntent.status !== 'succeeded') {
        return NextResponse.json(
          { success: false, error: 'Payment has not been completed' },
          { status: 400 }
        )
      }

      if (paymentIntent.metadata?.requestId !== requestId || paymentIntent.metadata?.offerId !== offerId) {
        return NextResponse.json(
          { success: false, error: 'Payment does not match this request/offer' },
          { status: 400 }
        )
      }

      // The intent was minted by /api/payments/create-intent from the offer
      // amount at that moment. A garage that re-priced since would otherwise
      // leave a deposit for the old price recorded against the new one — so
      // the charge has to be the deposit of the price being booked, to the cent
      // (same arithmetic as create-intent).
      const expectedDepositCents = Math.round(agreedPrice * (DEPOSIT_PERCENT / 100) * 100)
      if (paymentIntent.amount !== expectedDepositCents || paymentIntent.currency !== 'eur') {
        return NextResponse.json(
          {
            success: false,
            code: 'PAYMENT_AMOUNT_MISMATCH',
            error: 'Η προκαταβολή που πληρώθηκε δεν αντιστοιχεί στην τρέχουσα τιμή της προσφοράς. Επικοινωνήστε μαζί μας.',
          },
          { status: 409 }
        )
      }

      // Recorded from what Stripe actually charged, not recomputed.
      depositAmount = paymentIntent.amount / 100
      remainingAmount = Math.round((agreedPrice - depositAmount) * 100) / 100
    }

    const updatedAt = new Date().toISOString()

    const requestSetParts = [
      '#status = :appointment',
      'acceptedOfferId = :acceptedOfferId',
      // Stored alongside the offer id so the chat endpoints can answer "is this
      // garage still part of this job?" without reading the Offers table.
      'acceptedGarageId = :acceptedGarageId',
      'appointmentDate = :appointmentDate',
      'appointmentTime = :appointmentTime',
      'appointmentPrice = :appointmentPrice',
      'updatedAt = :updatedAt'
    ]
    const requestValues: Record<string, unknown> = {
      ':appointment': ServiceRequestStatus.APPOINTMENT,
      ':pending': ServiceRequestStatus.PENDING,
      ':acceptedOfferId': offerId,
      ':acceptedGarageId': acceptedGarageId,
      ':appointmentDate': appointmentDate,
      ':appointmentTime': appointmentTime ?? null,
      ':appointmentPrice': agreedPrice,
      ':updatedAt': updatedAt
    }

    if (paymentsEnabled && paymentIntentId) {
      requestSetParts.push(
        'paymentIntentId = :paymentIntentId',
        'depositAmount = :depositAmount',
        'remainingAmount = :remainingAmount'
      )
      requestValues[':paymentIntentId'] = paymentIntentId
      requestValues[':depositAmount'] = depositAmount
      requestValues[':remainingAmount'] = remainingAmount
    }

    // The request and the winning offer flip together or not at all, each
    // re-checked at write time: two tabs accepting different offers, an
    // accept racing a cancel, the garage withdrawing or re-pricing its offer,
    // or an admin deactivating the garage in between must never leave both
    // writes half-applied.
    try {
      await dynamoDB.send(new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: 'ServiceRequests',
              Key: { id: requestId },
              UpdateExpression: `SET ${requestSetParts.join(', ')}`,
              ConditionExpression: '#status = :pending AND attribute_not_exists(acceptedOfferId)',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: requestValues
            }
          },
          {
            Update: {
              TableName: 'Offers',
              Key: { id: offerId },
              UpdateExpression:
                'SET #status = :accepted, appointmentDate = :appointmentDate, ' +
                'appointmentTime = :appointmentTime, appointmentPrice = :appointmentPrice, ' +
                'updatedAt = :updatedAt',
              ConditionExpression:
                '#status = :pending AND serviceRequestId = :requestId AND offerAmount = :offerAmount',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: {
                ':accepted': OfferStatus.ACCEPTED,
                ':pending': OfferStatus.PENDING,
                ':requestId': requestId,
                // The raw stored value, so a legacy string amount still matches.
                ':offerAmount': acceptedOffer.offerAmount,
                ':appointmentDate': appointmentDate,
                ':appointmentTime': appointmentTime ?? null,
                ':appointmentPrice': agreedPrice,
                ':updatedAt': updatedAt
              }
            }
          },
          {
            // A deactivated garage keeps its existing bookings but takes no
            // new ones — its pending offers are still in clients' lists.
            ConditionCheck: {
              TableName: 'Garages',
              Key: { id: acceptedGarageId },
              ConditionExpression: 'isActive = :active',
              ExpressionAttributeValues: { ':active': true }
            }
          }
        ]
      }))
    } catch (err) {
      if (err instanceof TransactionCanceledException) {
        const failed = (i: number) => err.CancellationReasons?.[i]?.Code === 'ConditionalCheckFailed'

        if (failed(0)) {
          // The request moved on — re-read it so the message says what happened.
          const current = await dynamoDB.send(
            new GetCommand({ TableName: 'ServiceRequests', Key: { id: requestId }, ConsistentRead: true })
          )
          if (current.Item?.status !== ServiceRequestStatus.PENDING || current.Item?.acceptedOfferId) {
            return NextResponse.json(
              { success: false, error: closedRequestMessage(current.Item?.status) },
              { status: 409 }
            )
          }
        } else if (failed(1)) {
          const current = await dynamoDB.send(
            new GetCommand({ TableName: 'Offers', Key: { id: offerId }, ConsistentRead: true })
          )
          const currentAmount = Number(current.Item?.offerAmount)
          if (
            current.Item?.status === OfferStatus.PENDING &&
            Number.isFinite(currentAmount) &&
            toCents(currentAmount) !== toCents(agreedPrice)
          ) {
            return offerAmountChanged(currentAmount)
          }
          return NextResponse.json(OFFER_UNAVAILABLE, { status: 409 })
        } else if (failed(2)) {
          return NextResponse.json(GARAGE_UNAVAILABLE, { status: 409 })
        }
        // No condition failed (or the request's did and it is somehow still
        // open): a concurrent write held the same rows. Nothing was applied, so
        // the honest answer is "try again" — not "you already accepted".
        return NextResponse.json(ACCEPT_CONFLICT, { status: 409 })
      }
      throw err
    }

    const updatedRequest: Record<string, unknown> = {
      ...serviceRequest,
      status: ServiceRequestStatus.APPOINTMENT,
      acceptedOfferId: offerId,
      acceptedGarageId,
      appointmentDate,
      appointmentTime: appointmentTime ?? null,
      appointmentPrice: agreedPrice,
      updatedAt
    }

    // Only now that this acceptance has won are the competing offers closed.
    // Doing it first would let a request that then failed its condition
    // reject every offer of a job someone else had already settled. The index
    // this reads can lag an offer written a moment before the acceptance; the
    // offer write re-checks the request for that case (see offerWrites.ts),
    // and the garage screens read any offer on a closed request as closed.
    // The booking itself has already landed, so a failure here is logged
    // rather than reported as a failed acceptance.
    const rejectedOffers = await rejectPendingOffersOn(requestId, updatedAt, offerId).catch((err) => {
      console.error(`[accept-offer] could not close the competing offers on ${requestId}:`, err)
      return []
    })

    const acceptedClientId = serviceRequest.clientId as string

    // The client's offers alert, the winner's "offer accepted" alert and the
    // losers' pending counts all change with this write.
    invalidateUnread('client', acceptedClientId)
    invalidateUnread('garage', acceptedGarageId)
    for (const offer of rejectedOffers) {
      if (typeof offer.garageId === 'string') invalidateUnread('garage', offer.garageId)
    }

    logEvent({
      eventName: EventName.OfferAccepted,
      actorType: 'client',
      actorId: acceptedClientId,
      clientId: acceptedClientId,
      garageId: acceptedGarageId,
      requestId,
      offerId,
      source: 'api/requests/[requestId]/accept-offer',
      metadata: { appointmentDate, appointmentPrice: agreedPrice }
    })

    logEvent({
      eventName: EventName.AppointmentScheduled,
      actorType: 'system',
      clientId: acceptedClientId,
      garageId: acceptedGarageId,
      requestId,
      offerId,
      source: 'api/requests/[requestId]/accept-offer',
      metadata: { appointmentDate, appointmentPrice: agreedPrice }
    })

    for (const offer of rejectedOffers) {
      logEvent({
        eventName: EventName.OfferRejected,
        actorType: 'system',
        actorId: acceptedClientId,
        clientId: acceptedClientId,
        garageId: offer.garageId as string | undefined,
        requestId,
        offerId: offer.id as string,
        source: 'api/requests/[requestId]/accept-offer',
        metadata: { reason: 'another_offer_accepted' }
      })
    }

    // Tell every garage dashboard listening on the realtime channel to drop
    // this request from their list — once an offer is accepted it's no longer
    // available to anyone else.
    void broadcastRequestUpdate(requestId, ServiceRequestStatus.APPOINTMENT, 'offer_accepted')

    // Fire both confirmation emails (best-effort, never block).
    void notifyAcceptanceParticipants({
      clientId: acceptedClientId,
      garageId: acceptedGarageId,
      requestId,
      offerId,
      appointmentDate,
      appointmentTime: appointmentTime ?? undefined,
      appointmentPrice: agreedPrice,
      depositAmount: depositAmount ?? undefined,
      remainingAmount: remainingAmount ?? undefined
    })

    const photoUrls = updatedRequest.photoUrls as string[] | undefined
    const photos = updatedRequest.photos as Parameters<typeof presignPhotoRecords>[0] | undefined

    return NextResponse.json({
      success: true,
      request: {
        id: updatedRequest.id,
        clientId: updatedRequest.clientId,
        vehicleId: updatedRequest.vehicleId,
        category: updatedRequest.category,
        description: updatedRequest.description,
        status: updatedRequest.status,
        estimatedCost: updatedRequest.estimatedCost,
        photoUrls: (photoUrls && photoUrls.length > 0
          ? await generatePresignedUrls(photoUrls)
          : []),
        photos: (photos && photos.length > 0
          ? await presignPhotoRecords(photos)
          : []),
        createdAt: updatedRequest.createdAt,
        updatedAt: updatedRequest.updatedAt,
        clientAvailabilityDates: updatedRequest.clientAvailabilityDates || [],
        acceptedOfferId: updatedRequest.acceptedOfferId,
        appointmentDate: updatedRequest.appointmentDate,
        appointmentTime: updatedRequest.appointmentTime ?? null,
        appointmentPrice: updatedRequest.appointmentPrice
      }
    })
  } catch (error) {
    console.error('Error accepting offer for request:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to accept offer for this request',
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

async function notifyAcceptanceParticipants(args: {
  clientId: string
  garageId?: string
  requestId: string
  offerId: string
  appointmentDate: string
  appointmentTime?: string
  appointmentPrice?: number
  depositAmount?: number
  remainingAmount?: number
}): Promise<void> {
  try {
    const [clientRes, garageRes] = await Promise.all([
      dynamoDB.send(new GetCommand({ TableName: 'Clients', Key: { id: args.clientId } })),
      args.garageId
        ? dynamoDB.send(new GetCommand({ TableName: 'Garages', Key: { id: args.garageId } }))
        : Promise.resolve({ Item: undefined as Record<string, unknown> | undefined })
    ])

    // The templates take a single `appointmentDate` variable, so the hour is
    // folded into it rather than adding a variable every template would have
    // to learn about.
    const appointmentLabel = args.appointmentTime
      ? `${args.appointmentDate}, ${args.appointmentTime}`
      : args.appointmentDate

    const clientEmail = clientRes.Item?.email as string | undefined
    const garageEmail = garageRes.Item?.email as string | undefined
    const garageName = (garageRes.Item?.companyName as string) || 'συνεργείο'

    if (clientEmail) {
      sendEmail({
        to: clientEmail,
        templateName: EmailTemplate.AppointmentConfirmationClient,
        variables: {
          clientId: args.clientId,
          requestId: args.requestId,
          garageName,
          appointmentDate: appointmentLabel,
          appointmentPrice: args.appointmentPrice !== undefined ? String(args.appointmentPrice) : ''
        },
        triggerEvent: EventName.OfferAccepted,
        clientId: args.clientId,
        garageId: args.garageId,
        requestId: args.requestId
      })
    }

    // Payment confirmation email (when deposit was paid)
    if (clientEmail && args.depositAmount !== undefined) {
      sendEmail({
        to: clientEmail,
        templateName: EmailTemplate.PaymentConfirmationClient,
        variables: {
          clientId: args.clientId,
          requestId: args.requestId,
          garageName,
          appointmentDate: appointmentLabel,
          depositAmount: String(args.depositAmount),
          remainingAmount: String(args.remainingAmount ?? '')
        },
        triggerEvent: EventName.PaymentSucceeded,
        clientId: args.clientId,
        garageId: args.garageId,
        requestId: args.requestId
      })
    }

    if (garageEmail && args.garageId) {
      sendEmail({
        to: garageEmail,
        templateName: EmailTemplate.OfferAcceptedGarage,
        variables: {
          garageId: args.garageId,
          appointmentDate: appointmentLabel,
          offerAmount: args.appointmentPrice !== undefined ? String(args.appointmentPrice) : ''
        },
        triggerEvent: EventName.OfferAccepted,
        clientId: args.clientId,
        garageId: args.garageId,
        requestId: args.requestId
      })
    }
  } catch (err) {
    console.error('[accept-offer] notifyAcceptanceParticipants failed:', err)
  }
}

export const PATCH = withMetrics(_PATCH)
