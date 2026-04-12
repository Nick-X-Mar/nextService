import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { UpdateCommand } from '@aws-sdk/lib-dynamodb'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ garageId: string }> }
) {
  try {
    const { garageId } = await params

    await dynamoDB.send(new UpdateCommand({
      TableName: 'Garages',
      Key: { id: garageId },
      UpdateExpression: 'SET isActive = :inactive, deactivatedAt = :now',
      ExpressionAttributeValues: {
        ':inactive': false,
        ':now': new Date().toISOString()
      }
    }))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Garage deactivate error:', error)
    return NextResponse.json({ error: 'Failed to deactivate garage' }, { status: 500 })
  }
}
