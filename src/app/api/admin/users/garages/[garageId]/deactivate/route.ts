import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { invalidateGarageActive } from '@/utils/requireAuth'
import { withMetrics } from '@/utils/withMetrics'
import { TABLES } from '@/lib/tables'

async function _POST(
  _request: NextRequest,
  { params }: { params: Promise<{ garageId: string }> }
) {
  try {
    const { garageId } = await params
    const now = new Date().toISOString()

    try {
      await dynamoDB.send(new UpdateCommand({
        TableName: TABLES.Garages,
        Key: { id: garageId },
        UpdateExpression: 'SET isActive = :inactive, deactivatedAt = :now, updatedAt = :now',
        // Without the condition an unknown id would create a bare garage row.
        ConditionExpression: 'attribute_exists(id)',
        ExpressionAttributeValues: { ':inactive': false, ':now': now }
      }))
    } catch (err) {
      if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
        return NextResponse.json({ error: 'Garage not found' }, { status: 404 })
      }
      throw err
    }

    // requireActiveGarage caches the flag for up to 30s; a deactivation must
    // cut the garage off from client data at once, not half a minute later.
    invalidateGarageActive(garageId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Garage deactivate error:', error)
    return NextResponse.json({ error: 'Failed to deactivate garage' }, { status: 500 })
  }
}

export const POST = withMetrics(_POST)
