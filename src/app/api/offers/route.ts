import { NextRequest, NextResponse } from 'next/server'
import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { collectAll } from '@/utils/pagination'
import { OfferStatus, ServiceRequestStatus } from '@/types/statuses'
import { logEvent } from '@/utils/eventLogger'
import { sendEmail } from '@/utils/emailService'
import { EventName, EmailTemplate } from '@/types/events'
import { requireAuth, requireActiveGarage } from '@/utils/requireAuth'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'
import { invalidateUnread } from '@/utils/unreadCache'
import { parseAvailabilityDates, sanitizeSlots } from '@/utils/availabilitySlots'
import {
  MAX_AVAILABILITY_DATES,
  MAX_OFFER_AMOUNT,
  REQUEST_NOT_OPEN,
  WRITE_CONFLICT,
  failedTransactItem,
  isRequestOpen,
  isTransactionCancelled,
  offerIdFor,
  parseOfferAmount,
  putNewOffer,
  requestStillOpen,
} from './offerWrites'

const checkOfferRate = createRateLimiter('offer-create', 10, 3600000)

const MAX_BENEFITS = 20
const MAX_BENEFIT_LENGTH = 200

const OFFER_LOCKED = {
  success: false,
  code: 'OFFER_LOCKED',
  error: 'Η προσφορά δεν μπορεί πλέον να αλλάξει — ο πελάτης έχει ήδη απαντήσει ή το αίτημα έκλεισε.',
}

function badRequest(error: string) {
  return NextResponse.json({ success: false, error }, { status: 400 })
}

function parseBenefits(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) return null
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') return null
    const text = item.trim()
    if (text && text.length <= MAX_BENEFIT_LENGTH && !out.includes(text)) out.push(text)
  }
  return out.slice(0, MAX_BENEFITS)
}

async function _POST(request: NextRequest) {
  try {
    const garageId = await requireActiveGarage(request)
    if (garageId instanceof NextResponse) return garageId

    if (!checkOfferRate(garageId)) {
      return NextResponse.json(
        { error: 'Πολλές προσφορές. Δοκιμάστε ξανά σε 1 ώρα.' },
        { status: 429 }
      )
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return badRequest('Μη έγκυρο αίτημα')

    // Identity, status, estimate and offer number are never taken from the
    // body: a garage could otherwise file its offer as already "accepted".
    const { serviceRequestId } = body
    if (typeof serviceRequestId !== 'string' || !serviceRequestId) {
      return badRequest('Λείπει το αίτημα στο οποίο αφορά η προσφορά')
    }

    const offerAmount = parseOfferAmount(body.offerAmount)
    if (offerAmount === null) {
      return badRequest(`Το ποσό της προσφοράς πρέπει να είναι θετικό και έως ${MAX_OFFER_AMOUNT.toLocaleString('el-GR')} €`)
    }

    const parsedDates = parseAvailabilityDates(body.availabilityDates, MAX_AVAILABILITY_DATES)
    if ('error' in parsedDates) return badRequest(parsedDates.error)
    const availabilityDates = parsedDates.dates

    const benefits = parseBenefits(body.benefits)
    if (benefits === null) return badRequest('Μη έγκυρες παροχές')

    const requestRes = await dynamoDB.send(new GetCommand({
      TableName: 'ServiceRequests',
      Key: { id: serviceRequestId },
    }))
    const serviceRequest = requestRes.Item
    if (!serviceRequest) {
      return NextResponse.json({ success: false, error: 'Το αίτημα δεν βρέθηκε' }, { status: 404 })
    }
    if (serviceRequest.status !== ServiceRequestStatus.PENDING) {
      return NextResponse.json(REQUEST_NOT_OPEN, { status: 409 })
    }

    const offerExists = (offerId: string) => NextResponse.json(
      {
        success: false,
        code: 'OFFER_EXISTS',
        offerId,
        error: 'Έχετε ήδη στείλει προσφορά για αυτό το αίτημα. Μπορείτε να την ενημερώσετε.',
      },
      { status: 409 }
    )

    const offerId = offerIdFor(serviceRequestId, garageId)
    const now = new Date().toISOString()
    const offer = {
      id: offerId,
      offerNumber: `Offer_${now.slice(0, 10).replace(/-/g, '')}_${Math.floor(Math.random() * 999) + 1}`,
      serviceRequestId,
      garageId,
      // What the client was shown, so the garage sees it next to its own price.
      estimatedCost: typeof serviceRequest.estimatedCost === 'number' ? serviceRequest.estimatedCost : 0,
      offerAmount,
      status: OfferStatus.PENDING,
      benefits,
      availabilityDates,
      // Hourly slots keyed by date. Sanitised against availabilityDates so a
      // caller cannot record hours for a day this offer never included.
      availabilitySlots: sanitizeSlots(body.availabilitySlots, availabilityDates),
      clientAvailabilityDates: [],
      createdAt: now,
      updatedAt: now,
    }

    const outcome = await putNewOffer(offer)
    if (!outcome.ok) {
      if (outcome.code === 'OFFER_EXISTS') return offerExists(outcome.offerId)
      return NextResponse.json(
        outcome.code === 'REQUEST_NOT_OPEN' ? REQUEST_NOT_OPEN : WRITE_CONFLICT,
        { status: 409 }
      )
    }

    // The client's "new offer" alert and the garage's own offer counts.
    if (typeof serviceRequest.clientId === 'string') invalidateUnread('client', serviceRequest.clientId)
    invalidateUnread('garage', garageId)

    await logEvent({
      eventName: EventName.OfferCreated,
      actorType: 'garage',
      actorId: garageId,
      garageId,
      requestId: serviceRequestId,
      offerId,
      source: 'api/offers',
      metadata: { offerAmount }
    })

    // Email the client that owns this request. Best-effort lookup — never block.
    await notifyClientAboutNewOffer({
      clientId: serviceRequest.clientId as string | undefined,
      serviceRequestId,
      garageId,
      offerAmount,
    })

    return NextResponse.json({
      success: true,
      offer: offer
    })

  } catch (error) {
    console.error('Error creating offer:', error)
    return NextResponse.json({
      success: false,
      error: 'Δεν ήταν δυνατή η αποστολή της προσφοράς'
    }, { status: 500 })
  }
}

async function _GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    // A pending or deactivated garage has no business on the marketplace —
    // listing by request would tell it which requests exist.
    if (auth.userType === 'garage') {
      const active = await requireActiveGarage(request)
      if (active instanceof NextResponse) return active
    }

    const { searchParams } = new URL(request.url)
    const garageId = searchParams.get('garageId')
    const serviceRequestId = searchParams.get('serviceRequestId')

    if (!garageId && !serviceRequestId) {
      return NextResponse.json({
        success: false,
        error: 'garageId or serviceRequestId is required'
      }, { status: 400 })
    }

    // A garage's offer book — every price it quoted, on every request — is for
    // that garage alone. A client sees offers only through a request it owns
    // (checked below), never by naming a garage.
    if (garageId) {
      const ownBook = auth.userType === 'garage' && garageId === auth.userId
      const viaOwnRequest = auth.userType === 'client' && !!serviceRequestId
      if (!ownBook && !viaOwnRequest) {
        return NextResponse.json({ success: false, error: 'Δεν έχετε πρόσβαση σε αυτόν τον πόρο' }, { status: 403 })
      }
    }

    // Listing by request is how a client compares bids — but for a garage the
    // same query would expose every competitor's price on a request it is
    // bidding on. Clients get the full list for requests they own; garages are
    // narrowed to their own offer regardless of what they asked for.
    let scopedGarageId = garageId
    if (serviceRequestId) {
      const serviceRequest = await dynamoDB.send(new GetCommand({
        TableName: 'ServiceRequests',
        Key: { id: serviceRequestId }
      }))
      if (!serviceRequest.Item) {
        return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 })
      }
      if (auth.userType === 'client' && serviceRequest.Item.clientId !== auth.userId) {
        return NextResponse.json({ success: false, error: 'Δεν έχετε πρόσβαση σε αυτόν τον πόρο' }, { status: 403 })
      }
      if (auth.userType === 'garage') {
        scopedGarageId = auth.userId
      }
    }

    // These were three Scans with FilterExpression even though Offers has both
    // ServiceRequestOffersIndex and GarageOffersIndex — every call read the
    // whole table. They are Queries on those indexes now.
    //
    // Deliberately NOT cursor-paginated: a client comparing bids has to see all
    // of them at once, and a "load more" between offers would make comparison
    // worse, not better. `collectAll` drains every page instead, so the list is
    // complete rather than silently cut off at DynamoDB's 1MB boundary.
    let offers: Record<string, unknown>[]

    if (serviceRequestId) {
      const byRequest = await collectAll<Record<string, unknown>>(
        (startKey) =>
          dynamoDB.send(new QueryCommand({
            TableName: 'Offers',
            IndexName: 'ServiceRequestOffersIndex',
            KeyConditionExpression: 'serviceRequestId = :serviceRequestId',
            ExpressionAttributeValues: { ':serviceRequestId': serviceRequestId },
            ExclusiveStartKey: startKey,
          })),
        `offers for request ${serviceRequestId}`
      )
      // A garage may only ever see its own offer on someone else's request.
      offers = scopedGarageId
        ? byRequest.filter((o) => o.garageId === scopedGarageId)
        : byRequest
    } else {
      offers = await collectAll<Record<string, unknown>>(
        (startKey) =>
          dynamoDB.send(new QueryCommand({
            TableName: 'Offers',
            IndexName: 'GarageOffersIndex',
            KeyConditionExpression: 'garageId = :garageId',
            ExpressionAttributeValues: { ':garageId': scopedGarageId },
            ExclusiveStartKey: startKey,
          })),
        `offers for garage ${scopedGarageId}`
      )
    }

    return NextResponse.json({
      success: true,
      offers
    })

  } catch (error) {
    console.error('Error fetching offers:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch offers'
    }, { status: 500 })
  }
}

async function _PUT(request: NextRequest) {
  try {
    const garageId = await requireActiveGarage(request)
    if (garageId instanceof NextResponse) return garageId

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return badRequest('Μη έγκυρο αίτημα')

    // `status` is deliberately not read: only the client's acceptance (or a
    // competitor's) moves an offer out of pending. Taking it from here is what
    // let an edit flip an accepted offer back to pending and drop the
    // appointment off the garage's dashboard.
    const { offerId } = body
    if (typeof offerId !== 'string' || !offerId) return badRequest('Λείπει η προσφορά')

    const offerAmount = parseOfferAmount(body.offerAmount)
    if (offerAmount === null) {
      return badRequest(`Το ποσό της προσφοράς πρέπει να είναι θετικό και έως ${MAX_OFFER_AMOUNT.toLocaleString('el-GR')} €`)
    }

    const existingRes = await dynamoDB.send(new GetCommand({ TableName: 'Offers', Key: { id: offerId } }))
    const existing = existingRes.Item
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Η προσφορά δεν βρέθηκε' }, { status: 404 })
    }
    if (existing.garageId !== garageId) {
      return NextResponse.json({ success: false, error: 'Δεν έχετε πρόσβαση σε αυτόν τον πόρο' }, { status: 403 })
    }
    if (existing.status !== OfferStatus.PENDING) {
      return NextResponse.json(OFFER_LOCKED, { status: 409 })
    }

    // Anything the caller leaves out keeps its stored value. Defaulting an
    // omitted field to empty is how a price-only edit used to wipe the hours.
    let availabilityDates = (existing.availabilityDates as string[] | undefined) ?? []
    if (body.availabilityDates !== undefined) {
      const parsed = parseAvailabilityDates(body.availabilityDates, MAX_AVAILABILITY_DATES)
      if ('error' in parsed) return badRequest(parsed.error)
      availabilityDates = parsed.dates
    }
    const availabilitySlots = sanitizeSlots(
      body.availabilitySlots !== undefined ? body.availabilitySlots : existing.availabilitySlots,
      availabilityDates
    )
    let benefits = (existing.benefits as string[] | undefined) ?? []
    if (body.benefits !== undefined) {
      const parsed = parseBenefits(body.benefits)
      if (parsed === null) return badRequest('Μη έγκυρες παροχές')
      benefits = parsed
    }

    const serviceRequestId = existing.serviceRequestId as string
    const updatedAt = new Date().toISOString()

    try {
      await dynamoDB.send(new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: 'Offers',
              Key: { id: offerId },
              UpdateExpression: 'SET offerAmount = :offerAmount, benefits = :benefits, availabilityDates = :availabilityDates, availabilitySlots = :availabilitySlots, updatedAt = :updatedAt',
              // The read above is a fast path; this is what holds when the
              // client accepts in the same instant.
              ConditionExpression: '#status = :pending AND garageId = :garageId',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: {
                ':offerAmount': offerAmount,
                ':benefits': benefits,
                ':availabilityDates': availabilityDates,
                ':availabilitySlots': availabilitySlots,
                ':updatedAt': updatedAt,
                ':pending': OfferStatus.PENDING,
                ':garageId': garageId,
              },
            },
          },
          requestStillOpen(serviceRequestId),
        ],
      }))
    } catch (error) {
      if (!isTransactionCancelled(error)) throw error
      const failed = failedTransactItem(error)
      if (failed === 0) return NextResponse.json(OFFER_LOCKED, { status: 409 })
      if (failed === 1) return NextResponse.json(REQUEST_NOT_OPEN, { status: 409 })

      const [stored, open] = await Promise.all([
        dynamoDB.send(new GetCommand({ TableName: 'Offers', Key: { id: offerId }, ConsistentRead: true })),
        isRequestOpen(serviceRequestId),
      ])
      if (stored.Item?.status !== OfferStatus.PENDING || stored.Item?.garageId !== garageId) {
        return NextResponse.json(OFFER_LOCKED, { status: 409 })
      }
      if (!open) return NextResponse.json(REQUEST_NOT_OPEN, { status: 409 })
      return NextResponse.json(WRITE_CONFLICT, { status: 409 })
    }

    // A changed price or new dates are news to the client; the garage's own
    // counts read the same row.
    invalidateUnread('garage', garageId)
    await invalidateRequestOwner(serviceRequestId)

    await logEvent({
      eventName: EventName.OfferUpdated,
      actorType: 'garage',
      actorId: garageId,
      garageId,
      requestId: serviceRequestId,
      offerId,
      source: 'api/offers',
      metadata: { offerAmount, status: OfferStatus.PENDING }
    })

    return NextResponse.json({
      success: true,
      offer: { ...existing, offerAmount, benefits, availabilityDates, availabilitySlots, updatedAt }
    })

  } catch (error) {
    console.error('Error updating offer:', error)

    return NextResponse.json({
      success: false,
      error: 'Δεν ήταν δυνατή η ενημέρωση της προσφοράς'
    }, { status: 500 })
  }
}

/** Drops the cached alert summary of the client who owns a request. */
async function invalidateRequestOwner(serviceRequestId: string): Promise<void> {
  try {
    const res = await dynamoDB.send(new GetCommand({
      TableName: 'ServiceRequests',
      Key: { id: serviceRequestId },
      ProjectionExpression: 'clientId',
    }))
    if (typeof res.Item?.clientId === 'string') invalidateUnread('client', res.Item.clientId)
  } catch (err) {
    // Only a badge that lags by the cache TTL — never worth failing the edit.
    console.error('[offers] could not resolve the client to invalidate:', err)
  }
}

/**
 * Look up the client + garage behind a new offer, then fire the "new offer"
 * email to the client. Pure side effect — errors are logged and swallowed.
 */
async function notifyClientAboutNewOffer(args: {
  clientId?: string
  serviceRequestId: string
  garageId: string
  offerAmount: number
}): Promise<void> {
  try {
    if (!args.clientId) return

    const [clientRes, garageRes] = await Promise.all([
      dynamoDB.send(new GetCommand({ TableName: 'Clients', Key: { id: args.clientId } })),
      dynamoDB.send(new GetCommand({ TableName: 'Garages', Key: { id: args.garageId } }))
    ])

    const clientEmail = clientRes.Item?.email as string | undefined
    if (!clientEmail) return

    await sendEmail({
      to: clientEmail,
      templateName: EmailTemplate.NewOfferReceived,
      variables: {
        clientId: args.clientId,
        requestId: args.serviceRequestId,
        garageName: (garageRes.Item?.companyName as string) || 'συνεργείο',
        offerAmount: String(args.offerAmount)
      },
      triggerEvent: EventName.OfferCreated,
      clientId: args.clientId,
      garageId: args.garageId,
      requestId: args.serviceRequestId
    })
  } catch (err) {
    console.error('[offers] notifyClientAboutNewOffer failed:', err)
  }
}

export const GET = withMetrics(_GET)
export const POST = withMetrics(_POST)
export const PUT = withMetrics(_PUT)
