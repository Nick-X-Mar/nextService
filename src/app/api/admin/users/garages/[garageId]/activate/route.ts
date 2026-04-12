import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb'
import { sendEmail } from '@/utils/emailService'
import { logEvent } from '@/utils/eventLogger'
import { EventName, EmailTemplate } from '@/types/events'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ garageId: string }> }
) {
  try {
    const { garageId } = await params

    // Get garage details for the email
    const garageResult = await dynamoDB.send(new GetCommand({
      TableName: 'Garages',
      Key: { id: garageId }
    }))

    const garage = garageResult.Item
    if (!garage) {
      return NextResponse.json({ error: 'Garage not found' }, { status: 404 })
    }

    // Update isActive in DB
    await dynamoDB.send(new UpdateCommand({
      TableName: 'Garages',
      Key: { id: garageId },
      UpdateExpression: 'SET isActive = :active, activatedAt = :now',
      ExpressionAttributeValues: {
        ':active': true,
        ':now': new Date().toISOString()
      }
    }))

    // Log event
    logEvent({
      eventName: EventName.GarageValidated,
      actorType: 'system',
      actorId: 'admin',
      garageId,
      source: 'admin/activate'
    })

    // Send activation email to the garage
    sendEmail({
      to: garage.email,
      templateName: EmailTemplate.GarageActivated,
      variables: {
        companyName: garage.companyName || '',
      },
      triggerEvent: EventName.GarageValidated,
      garageId,
    })

    return NextResponse.json({ success: true, email: garage.email })
  } catch (error) {
    console.error('Garage activate error:', error)
    return NextResponse.json({ error: 'Failed to activate garage' }, { status: 500 })
  }
}
