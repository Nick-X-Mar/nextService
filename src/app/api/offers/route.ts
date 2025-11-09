import { NextRequest, NextResponse } from 'next/server'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'

// Initialize DynamoDB client
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
})

const docClient = DynamoDBDocumentClient.from(client)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      offerNumber,
      estimatedCost,
      offerAmount,
      status,
      benefits,
      availabilityDates,
      serviceRequestId,
      garageId
    } = body

    // Validate required fields
    if (!serviceRequestId || !garageId || !offerAmount || offerAmount <= 0) {
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
      status: status || 'pending',
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
    const { searchParams } = new URL(request.url)
    const garageId = searchParams.get('garageId')
    const serviceRequestId = searchParams.get('serviceRequestId')

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
        ':status': status || 'pending',
        ':updatedAt': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    })

    const result = await docClient.send(command)

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
