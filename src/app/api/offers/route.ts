import { NextRequest, NextResponse } from 'next/server'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb'
import { collectAll } from '@/utils/pagination'
import { OfferStatus } from '@/types/statuses'
import { logEvent } from '@/utils/eventLogger'
import { sendEmail } from '@/utils/emailService'
import { EventName, EmailTemplate } from '@/types/events'
import { requireAuth, requireGarage } from '@/utils/requireAuth'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'
import { randomUUID } from 'crypto'

const checkOfferRate = createRateLimiter('offer-create', 10, 3600000)

// Initialize DynamoDB client
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
})

const docClient = DynamoDBDocumentClient.from(client)

async function _POST(request: NextRequest) {
  try {
    const garageId = requireGarage(request)
    if (garageId instanceof NextResponse) return garageId

    if (!checkOfferRate(garageId)) {
      return NextResponse.json(
        { error: 'Πολλές προσφορές. Δοκιμάστε ξανά σε 1 ώρα.' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const {
      offerNumber,
      estimatedCost,
      offerAmount,
      status,
      benefits,
      availabilityDates,
      serviceRequestId,
    } = body

    // Validate required fields
    if (!serviceRequestId || !offerAmount || offerAmount <= 0) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields or invalid offer amount'
      }, { status: 400 })
    }

    // Generate unique offer ID
    const offerId = `offer_${randomUUID()}`

    const offer = {
      id: offerId,
      offerNumber: offerNumber || `Offer_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${Math.floor(Math.random() * 999) + 1}`,
      serviceRequestId,
      garageId,
      estimatedCost: estimatedCost || 0,
      offerAmount,
      status: status || OfferStatus.PENDING,
      benefits: benefits || [],
      availabilityDates: availabilityDates || [],
      clientAvailabilityDates: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    // Save offer to DynamoDB
    const command = new PutCommand({
      TableName: 'Offers',
      Item: offer,
      ConditionExpression: 'attribute_not_exists(id)' // Prevent overwriting
    })

    await docClient.send(command)

    logEvent({
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
    void notifyClientAboutNewOffer({ serviceRequestId, garageId, offerId, offerAmount })

    return NextResponse.json({
      success: true,
      offer: offer
    })

  } catch (error) {
    console.error('Error creating offer:', error)

    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      return NextResponse.json({
        success: false,
        error: 'Offer already exists'
      }, { status: 409 })
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to create offer'
    }, { status: 500 })
  }
}

async function _GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const garageId = searchParams.get('garageId')
    const serviceRequestId = searchParams.get('serviceRequestId')

    // If requesting by garageId and caller is a garage, they can only see their own offers
    if (garageId && auth.userType === 'garage' && garageId !== auth.userId) {
      return NextResponse.json({ success: false, error: 'Δεν έχετε πρόσβαση σε αυτόν τον πόρο' }, { status: 403 })
    }

    if (!garageId && !serviceRequestId) {
      return NextResponse.json({
        success: false,
        error: 'garageId or serviceRequestId is required'
      }, { status: 400 })
    }

    // Listing by request is how a client compares bids — but for a garage the
    // same query would expose every competitor's price on a request it is
    // bidding on. Clients get the full list for requests they own; garages are
    // narrowed to their own offer regardless of what they asked for.
    let scopedGarageId = garageId
    if (serviceRequestId) {
      const serviceRequest = await docClient.send(new GetCommand({
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
          docClient.send(new QueryCommand({
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
          docClient.send(new QueryCommand({
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
    const garageId = requireGarage(request)
    if (garageId instanceof NextResponse) return garageId

    const body = await request.json()
    const {
      offerId,
      offerAmount,
      benefits,
      availabilityDates,
      status
    } = body

    // Validate required fields
    if (!offerId || !offerAmount || offerAmount <= 0) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields or invalid offer amount'
      }, { status: 400 })
    }

    // Verify the offer belongs to this garage
    const existingOffer = await docClient.send(new GetCommand({ TableName: 'Offers', Key: { id: offerId } }))
    if (!existingOffer.Item) {
      return NextResponse.json({ success: false, error: 'Offer not found' }, { status: 404 })
    }
    if (existingOffer.Item.garageId !== garageId) {
      return NextResponse.json({ success: false, error: 'Δεν έχετε πρόσβαση σε αυτόν τον πόρο' }, { status: 403 })
    }

    // Update offer in DynamoDB
    const command = new UpdateCommand({
      TableName: 'Offers',
      Key: {
        id: offerId
      },
      UpdateExpression: 'SET offerAmount = :offerAmount, benefits = :benefits, availabilityDates = :availabilityDates, #status = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':offerAmount': offerAmount,
        ':benefits': benefits || [],
        ':availabilityDates': availabilityDates || [],
        ':status': status || OfferStatus.PENDING,
        ':updatedAt': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    })

    const result = await docClient.send(command)

    logEvent({
      eventName: EventName.OfferUpdated,
      actorType: 'garage',
      actorId: result.Attributes?.garageId,
      garageId: result.Attributes?.garageId,
      requestId: result.Attributes?.serviceRequestId,
      offerId,
      source: 'api/offers',
      metadata: { offerAmount, status: status || OfferStatus.PENDING }
    })

    return NextResponse.json({
      success: true,
      offer: result.Attributes
    })

  } catch (error) {
    console.error('Error updating offer:', error)

    return NextResponse.json({
      success: false,
      error: 'Failed to update offer'
    }, { status: 500 })
  }
}

/**
 * Look up the client + garage that own a request, then fire the
 * "new offer" email to the client. Pure side effect — errors are logged
 * and swallowed.
 */
async function notifyClientAboutNewOffer(args: {
  serviceRequestId: string
  garageId: string
  offerId: string
  offerAmount: number
}): Promise<void> {
  try {
    const requestRes = await docClient.send(new GetCommand({
      TableName: 'ServiceRequests',
      Key: { id: args.serviceRequestId }
    }))
    const sr = requestRes.Item
    if (!sr?.clientId) return

    const [clientRes, garageRes] = await Promise.all([
      docClient.send(new GetCommand({ TableName: 'Clients', Key: { id: sr.clientId } })),
      docClient.send(new GetCommand({ TableName: 'Garages', Key: { id: args.garageId } }))
    ])

    const clientEmail = clientRes.Item?.email as string | undefined
    if (!clientEmail) return

    sendEmail({
      to: clientEmail,
      templateName: EmailTemplate.NewOfferReceived,
      variables: {
        clientId: sr.clientId,
        requestId: args.serviceRequestId,
        garageName: (garageRes.Item?.companyName as string) || 'συνεργείο',
        offerAmount: String(args.offerAmount)
      },
      triggerEvent: EventName.OfferCreated,
      clientId: sr.clientId,
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
