import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb'
import { OfferStatus } from '@/types/statuses'
import { logEvent } from '@/utils/eventLogger'
import { sendEmail } from '@/utils/emailService'
import { EventName, EmailTemplate } from '@/types/events'
import { withMetrics } from '@/utils/withMetrics'

async function _POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params
    const body = await request.json()
    const { garageId, price, availabilityDates } = body

    if (!garageId || !price || price <= 0) {
      return NextResponse.json(
        { error: 'garageId and price (> 0) are required' },
        { status: 400 }
      )
    }

    // Verify request + garage exist (parallel)
    const [reqResult, garageResult] = await Promise.all([
      dynamoDB.send(new GetCommand({
        TableName: 'ServiceRequests',
        Key: { id: requestId }
      })),
      dynamoDB.send(new GetCommand({
        TableName: 'Garages',
        Key: { id: garageId }
      }))
    ])

    const sr = reqResult.Item
    if (!sr) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    const garage = garageResult.Item
    if (!garage) {
      return NextResponse.json({ error: 'Garage not found' }, { status: 404 })
    }

    // Create offer on behalf of the garage
    const offerId = `offer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const now = new Date().toISOString()

    const offer = {
      id: offerId,
      offerNumber: `Admin_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${Math.floor(Math.random() * 999) + 1}`,
      serviceRequestId: requestId,
      garageId,
      estimatedCost: 0,
      offerAmount: price,
      status: OfferStatus.PENDING,
      benefits: [],
      availabilityDates: availabilityDates || [],
      clientAvailabilityDates: [],
      createdAt: now,
      updatedAt: now,
      createdByAdmin: true
    }

    await dynamoDB.send(new PutCommand({
      TableName: 'Offers',
      Item: offer,
      ConditionExpression: 'attribute_not_exists(id)'
    }))

    logEvent({
      eventName: EventName.OfferCreated,
      actorType: 'admin',
      actorId: 'admin',
      garageId,
      requestId,
      offerId,
      source: 'api/admin/requests/[requestId]/assign',
      metadata: { offerAmount: price, adminAssigned: true }
    })

    // Send email to client (fire-and-forget)
    void (async () => {
      try {
        if (!sr.clientId) return
        const clientRes = await dynamoDB.send(new GetCommand({
          TableName: 'Clients',
          Key: { id: sr.clientId }
        }))
        const clientEmail = clientRes.Item?.email as string | undefined
        if (!clientEmail) return

        sendEmail({
          to: clientEmail,
          templateName: EmailTemplate.NewOfferReceived,
          variables: {
            clientId: sr.clientId,
            requestId,
            garageName: garage.companyName || 'συνεργείο',
            offerAmount: String(price)
          },
          triggerEvent: EventName.OfferCreated,
          clientId: sr.clientId,
          garageId,
          requestId
        })
      } catch (err) {
        console.error('[admin/assign] email notification failed:', err)
      }
    })()

    return NextResponse.json({
      success: true,
      offerId,
      garageName: garage.companyName || garageId
    })
  } catch (error) {
    console.error('Admin assign error:', error)
    return NextResponse.json({ error: 'Failed to assign request' }, { status: 500 })
  }
}

export const POST = withMetrics(_POST)
