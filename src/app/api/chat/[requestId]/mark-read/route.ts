import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb'
import { requireClient } from '@/utils/requireAuth'
import { withMetrics } from '@/utils/withMetrics'

async function _POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    // Only the client reads-and-clears here; the garage dashboard computes its
    // own unread counts from the message list.
    const clientId = requireClient(request)
    if (clientId instanceof NextResponse) return clientId

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
    if (requestResult.Item.clientId !== clientId) {
      return NextResponse.json({ error: 'Δεν έχετε πρόσβαση' }, { status: 403 })
    }

    // Read state belongs to the thread, not to the garage. It used to be a
    // single `lastReadByClient` field on the Garages row, which meant any one
    // client opening a chat cleared that garage's unread badge for every other
    // client. A request has exactly one client, so (requestId, garageId)
    // identifies the thread — store it on the request as a garageId -> ISO map.
    //
    // Two updates so concurrent marks on different garages can't clobber each
    // other: create the map if absent, then set only this garage's key.
    await dynamoDB.send(new UpdateCommand({
      TableName: 'ServiceRequests',
      Key: { id: requestId },
      UpdateExpression: 'SET clientReadAt = if_not_exists(clientReadAt, :empty)',
      ExpressionAttributeValues: { ':empty': {} }
    }))

    await dynamoDB.send(new UpdateCommand({
      TableName: 'ServiceRequests',
      Key: { id: requestId },
      UpdateExpression: 'SET clientReadAt.#garageId = :timestamp',
      ExpressionAttributeNames: { '#garageId': garageId },
      ExpressionAttributeValues: { ':timestamp': new Date().toISOString() }
    }))


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

export const POST = withMetrics(_POST)
