import { NextRequest, NextResponse } from 'next/server'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import { requireClient } from '@/utils/requireAuth'
import { withMetrics } from '@/utils/withMetrics'

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.DYNAMODB_ENDPOINT || undefined
})

const docClient = DynamoDBDocumentClient.from(client)

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

    const body = await request.json()
    const clientAvailabilityDates = body?.clientAvailabilityDates

    if (!Array.isArray(clientAvailabilityDates)) {
      return NextResponse.json(
        { success: false, error: 'clientAvailabilityDates must be an array of strings' },
        { status: 400 }
      )
    }

    if (clientAvailabilityDates.length > 5) {
      return NextResponse.json(
        { success: false, error: 'Μπορείτε να προτείνετε έως 5 ημερομηνίες.' },
        { status: 400 }
      )
    }

    const normalizedDates = clientAvailabilityDates
      .map((date: unknown) => (typeof date === 'string' ? date.trim() : ''))
      .filter((date): date is string => date.length > 0)

    if (normalizedDates.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Παρακαλώ εισάγετε τουλάχιστον μία ημερομηνία.' },
        { status: 400 }
      )
    }

    const uniqueDates = Array.from(new Set(normalizedDates)).sort()

    const updateCommand = new UpdateCommand({
      TableName: 'Offers',
      Key: {
        id: offerId
      },
      UpdateExpression: 'SET clientAvailabilityDates = :dates, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':dates': uniqueDates,
        ':updatedAt': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    })

    const result = await docClient.send(updateCommand)

    logEvent({
      eventName: EventName.OfferClientAvailabilityProposed,
      actorType: 'client',
      offerId,
      garageId: result.Attributes?.garageId,
      requestId: result.Attributes?.serviceRequestId,
      source: 'api/offers/[offerId]/client-availability',
      metadata: { dateCount: uniqueDates.length }
    })

    return NextResponse.json({
      success: true,
      offer: result.Attributes
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
