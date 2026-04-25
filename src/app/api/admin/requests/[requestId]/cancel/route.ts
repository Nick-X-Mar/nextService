import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { ServiceRequestStatus } from '@/types/statuses'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import { withMetrics } from '@/utils/withMetrics'
import { broadcastRequestUpdate } from '@/utils/requestBroadcast'

async function _PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params

    // Verify request exists
    const reqResult = await dynamoDB.send(new ScanCommand({
      TableName: 'ServiceRequests',
      FilterExpression: 'id = :id',
      ExpressionAttributeValues: { ':id': requestId }
    }))
    const sr = reqResult.Items?.[0]
    if (!sr) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    if (sr.status === ServiceRequestStatus.CANCELLED) {
      return NextResponse.json({ error: 'Request is already cancelled' }, { status: 400 })
    }

    const now = new Date().toISOString()

    await dynamoDB.send(new UpdateCommand({
      TableName: 'ServiceRequests',
      Key: { id: requestId },
      UpdateExpression: 'SET #status = :status, cancelledAt = :now, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': ServiceRequestStatus.CANCELLED,
        ':now': now
      }
    }))

    logEvent({
      eventName: EventName.AppointmentCancelled,
      actorType: 'admin',
      actorId: 'admin',
      clientId: sr.clientId,
      requestId,
      source: 'api/admin/requests/[requestId]/cancel',
      metadata: { previousStatus: sr.status, cancelledByAdmin: true }
    })

    // Drop the card from any garage dashboard that's currently displaying it.
    void broadcastRequestUpdate(requestId, ServiceRequestStatus.CANCELLED, 'admin_cancelled')

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin cancel error:', error)
    return NextResponse.json({ error: 'Failed to cancel request' }, { status: 500 })
  }
}

export const PATCH = withMetrics(_PATCH)
