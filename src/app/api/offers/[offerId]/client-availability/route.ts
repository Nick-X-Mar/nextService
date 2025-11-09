import { NextRequest, NextResponse } from 'next/server'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb'

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.DYNAMODB_ENDPOINT || undefined
})

const docClient = DynamoDBDocumentClient.from(client)

export async function PATCH(
  request: NextRequest,
  { params }: { params: { offerId: string } }
) {
  try {
    const { offerId } = params

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

