import { NextRequest, NextResponse } from 'next/server'
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import { OfferStatus, ServiceRequestStatus } from '@/types/statuses'
import { requireClient } from '@/utils/requireAuth'
import { parseAvailabilityDates } from '@/utils/availabilitySlots'
import { invalidateUnread } from '@/utils/unreadCache'
import { withMetrics } from '@/utils/withMetrics'

const MAX_CLIENT_DATES = 5

async function _PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  try {
    const clientId = requireClient(request)
    if (clientId instanceof NextResponse) return clientId

    const { offerId } = await params

    if (!offerId) {
      return NextResponse.json(
        { success: false, error: 'Offer ID is required' },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => null)
    const raw = body?.clientAvailabilityDates

    if (!Array.isArray(raw)) {
      return NextResponse.json(
        { success: false, error: 'clientAvailabilityDates must be an array of strings' },
        { status: 400 }
      )
    }

    const trimmed = raw
      .map((date: unknown) => (typeof date === 'string' ? date.trim() : ''))
      .filter((date: string) => date.length > 0)

    if (trimmed.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Παρακαλώ εισάγετε τουλάχιστον μία ημερομηνία.' },
        { status: 400 }
      )
    }

    const parsed = parseAvailabilityDates(trimmed, MAX_CLIENT_DATES)
    if ('error' in parsed) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })
    }
    const uniqueDates = parsed.dates

    // Only the client who owns the request may answer an offer on it. This
    // used to be an unconditional update keyed on the URL alone, so any signed
    // in client could rewrite any garage's offer — or, with a made-up id,
    // create a stray Offers row.
    const offerRes = await dynamoDB.send(new GetCommand({ TableName: 'Offers', Key: { id: offerId } }))
    const offer = offerRes.Item
    if (!offer) {
      return NextResponse.json({ success: false, error: 'Η προσφορά δεν βρέθηκε' }, { status: 404 })
    }
    const requestRes = await dynamoDB.send(new GetCommand({
      TableName: 'ServiceRequests',
      Key: { id: offer.serviceRequestId },
    }))
    if (!requestRes.Item || requestRes.Item.clientId !== clientId) {
      return NextResponse.json({ success: false, error: 'Δεν έχετε πρόσβαση σε αυτόν τον πόρο' }, { status: 403 })
    }

    const updatedAt = new Date().toISOString()
    try {
      await dynamoDB.send(new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: 'Offers',
              Key: { id: offerId },
              // The proposal's own timestamp, not updatedAt: the garage's alert
              // must come back for a new proposal, not for every edit of the
              // offer the garage itself makes.
              UpdateExpression: 'SET clientAvailabilityDates = :dates, clientAvailabilityProposedAt = :updatedAt, updatedAt = :updatedAt',
              ConditionExpression: '#status = :pending',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: {
                ':dates': uniqueDates,
                ':updatedAt': updatedAt,
                ':pending': OfferStatus.PENDING,
              },
            },
          },
          {
            ConditionCheck: {
              TableName: 'ServiceRequests',
              Key: { id: offer.serviceRequestId },
              ConditionExpression: '#status = :open AND clientId = :clientId',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: { ':open': ServiceRequestStatus.PENDING, ':clientId': clientId },
            },
          },
        ],
      }))
    } catch (error) {
      if (error instanceof Error && error.name === 'TransactionCanceledException') {
        return NextResponse.json(
          { success: false, error: 'Η προσφορά δεν είναι πλέον ενεργή — το αίτημα έχει κλείσει.' },
          { status: 409 }
        )
      }
      throw error
    }

    // So the garage's "the client proposed dates" alert shows on its next poll
    // instead of after the summary cache expires.
    invalidateUnread('garage', offer.garageId as string)

    logEvent({
      eventName: EventName.OfferClientAvailabilityProposed,
      actorType: 'client',
      actorId: clientId,
      clientId,
      offerId,
      garageId: offer.garageId,
      requestId: offer.serviceRequestId,
      source: 'api/offers/[offerId]/client-availability',
      metadata: { dateCount: uniqueDates.length }
    })

    return NextResponse.json({
      success: true,
      offer: { ...offer, clientAvailabilityDates: uniqueDates, clientAvailabilityProposedAt: updatedAt, updatedAt }
    })
  } catch (error) {
    console.error('Error updating offer client availability:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Δεν ήταν δυνατή η ενημέρωση των ημερομηνιών. Δοκιμάστε ξανά αργότερα.'
      },
      { status: 500 }
    )
  }
}

export const PATCH = withMetrics(_PATCH)
