import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { UpdateCommand } from '@aws-sdk/lib-dynamodb'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
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
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
