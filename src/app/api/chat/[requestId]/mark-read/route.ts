import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb'
import { requireAuth } from '@/utils/requireAuth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { requestId } = await params
    const body = await request.json()
    const { garageId } = body

    if (!requestId) {
      return NextResponse.json({ 
        error: 'Request ID is required' 
      }, { status: 400 })
    }

    if (!garageId) {
      return NextResponse.json({
        error: 'Garage ID is required'
      }, { status: 400 })
    }

    // Verify the user owns this request
    const requestResult = await dynamoDB.send(new GetCommand({
      TableName: 'ServiceRequests',
      Key: { id: requestId }
    }))
    if (!requestResult.Item) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }
    if (auth.userType === 'client' && requestResult.Item.clientId !== auth.userId) {
      return NextResponse.json({ error: 'Δεν έχετε πρόσβαση' }, { status: 403 })
    }

    // Update the garage's lastReadByClient timestamp to mark messages as read
    const updateCommand = new UpdateCommand({
      TableName: 'Garages',
      Key: {
        id: garageId
      },
      UpdateExpression: 'SET lastReadByClient = :timestamp',
      ExpressionAttributeValues: {
        ':timestamp': new Date().toISOString()
      }
    })

    await dynamoDB.send(updateCommand)
    
    return NextResponse.json({
      success: true,
      message: 'Messages marked as read'
    })

  } catch (error) {
    console.error('Error marking messages as read:', error)
    return NextResponse.json(
      { 
        error: 'Error marking messages as read',
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}
