import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { OfferStatus, ServiceRequestStatus } from '@/types/statuses'
import { logEvent } from '@/utils/eventLogger'
import { sendEmail } from '@/utils/emailService'
import { EventName, EmailTemplate } from '@/types/events'
import { withMetrics } from '@/utils/withMetrics'
import { invalidateUnread } from '@/utils/unreadCache'
import { buildDayHours, fillMissingSlots, parseAvailabilityDates } from '@/utils/availabilitySlots'
import {
  MAX_AVAILABILITY_DATES,
  MAX_OFFER_AMOUNT,
  REQUEST_NOT_OPEN,
  WRITE_CONFLICT,
  offerIdFor,
  parseOfferAmount,
  putNewOffer,
} from '@/app/api/offers/offerWrites'

/**
 * The admin files an offer on a garage's behalf — typically a quote the garage
 * gave by phone. It is an ordinary offer in every other respect, so it goes
 * through the same write as the garage's own: one per garage per request, and
 * only while the request still takes offers.
 */
async function _POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params
    const body = await request.json().catch(() => null)
    const garageId = typeof body?.garageId === 'string' ? body.garageId : ''

    // A number, not just something truthy: this becomes the offer amount the
    // client books at and the quote commission falls back to.
    const price = parseOfferAmount(body?.price)
    if (!garageId || price === null) {
      return NextResponse.json(
        { error: `Επιλέξτε συνεργείο και θετική τιμή έως ${MAX_OFFER_AMOUNT.toLocaleString('el-GR')} €.` },
        { status: 400 }
      )
    }

    const parsedDates = parseAvailabilityDates(body?.availabilityDates, MAX_AVAILABILITY_DATES)
    if ('error' in parsedDates) {
      return NextResponse.json({ error: parsedDates.error }, { status: 400 })
    }
    const availabilityDates = parsedDates.dates

    const [reqResult, garageResult] = await Promise.all([
      dynamoDB.send(new GetCommand({ TableName: 'ServiceRequests', Key: { id: requestId } })),
      dynamoDB.send(new GetCommand({ TableName: 'Garages', Key: { id: garageId } })),
    ])

    const sr = reqResult.Item
    if (!sr) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }
    if (sr.status !== ServiceRequestStatus.PENDING) {
      return NextResponse.json(
        { ...REQUEST_NOT_OPEN, error: 'Ανάθεση γίνεται μόνο σε αίτημα που περιμένει προσφορές.' },
        { status: 409 }
      )
    }

    const garage = garageResult.Item
    if (!garage) {
      return NextResponse.json({ error: 'Garage not found' }, { status: 404 })
    }
    // The client could never book it: acceptance refuses a garage that is not active.
    if (garage.isActive !== true) {
      return NextResponse.json(
        { code: 'GARAGE_INACTIVE', error: 'Το συνεργείο δεν είναι ενεργό.' },
        { status: 409 }
      )
    }

    const offerId = offerIdFor(requestId, garageId)
    const now = new Date().toISOString()

    const offer = {
      id: offerId,
      offerNumber: `Admin_${now.slice(0, 10).replace(/-/g, '')}_${Math.floor(Math.random() * 999) + 1}`,
      serviceRequestId: requestId,
      garageId,
      estimatedCost: typeof sr.estimatedCost === 'number' ? sr.estimatedCost : 0,
      offerAmount: price,
      status: OfferStatus.PENDING,
      benefits: [],
      availabilityDates,
      // The admin picks days, not hours. Each day is open for the garage's whole
      // working day, as the garage's own form does for an untouched column —
      // without slots the client would book the day with no hour at all.
      availabilitySlots: fillMissingSlots(
        {},
        availabilityDates,
        buildDayHours(garage.workdayStartTime as string | undefined, garage.workdayEndTime as string | undefined)
      ),
      clientAvailabilityDates: [],
      createdAt: now,
      updatedAt: now,
      createdByAdmin: true
    }

    const outcome = await putNewOffer(offer)
    if (!outcome.ok) {
      if (outcome.code === 'OFFER_EXISTS') {
        return NextResponse.json(
          {
            code: 'OFFER_EXISTS',
            offerId: outcome.offerId,
            error: 'Το συνεργείο έχει ήδη στείλει προσφορά σε αυτό το αίτημα.',
          },
          { status: 409 }
        )
      }
      if (outcome.code === 'REQUEST_NOT_OPEN') {
        return NextResponse.json(
          { ...REQUEST_NOT_OPEN, error: 'Το αίτημα δεν δέχεται πλέον προσφορές.' },
          { status: 409 }
        )
      }
      return NextResponse.json(WRITE_CONFLICT, { status: 409 })
    }

    if (typeof sr.clientId === 'string') invalidateUnread('client', sr.clientId)
    invalidateUnread('garage', garageId)

    logEvent({
      eventName: EventName.OfferCreated,
      actorType: 'admin',
      actorId: 'admin',
      garageId,
      requestId,
      offerId,
      source: 'api/admin/requests/[requestId]/assign',
      metadata: { offerAmount: price, adminAssigned: true }
    })

    // Send email to client (fire-and-forget)
    void (async () => {
      try {
        if (!sr.clientId) return
        const clientRes = await dynamoDB.send(new GetCommand({
          TableName: 'Clients',
          Key: { id: sr.clientId }
        }))
        const clientEmail = clientRes.Item?.email as string | undefined
        if (!clientEmail) return

        sendEmail({
          to: clientEmail,
          templateName: EmailTemplate.NewOfferReceived,
          variables: {
            clientId: sr.clientId,
            requestId,
            garageName: garage.companyName || 'συνεργείο',
            offerAmount: String(price)
          },
          triggerEvent: EventName.OfferCreated,
          clientId: sr.clientId,
          garageId,
          requestId
        })
      } catch (err) {
        console.error('[admin/assign] email notification failed:', err)
      }
    })()

    return NextResponse.json({
      success: true,
      offerId,
      garageName: garage.companyName || garageId
    })
  } catch (error) {
    console.error('Admin assign error:', error)
    return NextResponse.json({ error: 'Failed to assign request' }, { status: 500 })
  }
}

export const POST = withMetrics(_POST)
