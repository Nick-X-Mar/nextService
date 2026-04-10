import { NextRequest, NextResponse } from 'next/server'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb'
import { OfferStatus } from '@/types/statuses'
import { logEvent } from '@/utils/eventLogger'
import { sendEmail } from '@/utils/emailService'
import { EventName, EmailTemplate } from '@/types/events'
import { requireAuth, requireGarage } from '@/utils/requireAuth'
import { createRateLimiter } from '@/utils/rateLimit'

const checkOfferRate = createRateLimiter('offer-create', 10, 3600000)

// Initialize DynamoDB client
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
})

const docClient = DynamoDBDocumentClient.from(client)

export async function POST(request: NextRequest) {
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
    const offerId = `offer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

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

  } catch (error: any) {
    console.error('Error creating offer:', error)
    
    if (error.name === 'ConditionalCheckFailedException') {
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

export async function GET(request: NextRequest) {
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

    let command
    if (garageId && serviceRequestId) {
      // Query offers by both garage and service request using Scan with filter
      command = new ScanCommand({
        TableName: 'Offers',
        FilterExpression: 'garageId = :garageId AND serviceRequestId = :serviceRequestId',
        ExpressionAttributeValues: {
          ':garageId': garageId,
          ':serviceRequestId': serviceRequestId
        }
      })
    } else if (garageId) {
      // Query offers by garage using Scan with filter
      command = new ScanCommand({
        TableName: 'Offers',
        FilterExpression: 'garageId = :garageId',
        ExpressionAttributeValues: {
          ':garageId': garageId
        }
      })
    } else {
      // Query offers by service request using Scan with filter
      command = new ScanCommand({
        TableName: 'Offers',
        FilterExpression: 'serviceRequestId = :serviceRequestId',
        ExpressionAttributeValues: {
          ':serviceRequestId': serviceRequestId
        }
      })
    }

    const result = await docClient.send(command)

    return NextResponse.json({
      success: true,
      offers: result.Items || []
    })

  } catch (error) {
    console.error('Error fetching offers:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch offers'
    }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
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

  } catch (error: any) {
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
