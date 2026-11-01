import { NextRequest, NextResponse } from 'next/server'
import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { withMetrics } from '@/utils/withMetrics'
import { logEvent } from '@/utils/eventLogger'
import { ensureGarageSettlementsTable } from '@/utils/ensureLedgerTables'
import { EventName } from '@/types/events'
import { TABLES } from '@/lib/tables'

/**
 * PUT /api/admin/commissions/settlements/[settlementId]
 * Body: { decision: 'confirmed' | 'rejected', note?: string }
 *
 * The admin's check of a payment a garage declared: `confirmed` once it is
 * found in the bank, `rejected` when it is not — a rejected payment stops
 * counting against what the garage owes. Can be changed later.
 */
async function _PUT(
  request: NextRequest,
  { params }: { params: Promise<{ settlementId: string }> }
) {
  try {
    const { settlementId } = await params
    const body = (await request.json().catch(() => null)) ?? {}
    if (body.decision !== 'confirmed' && body.decision !== 'rejected') {
      return NextResponse.json({ error: 'Η απόφαση πρέπει να είναι confirmed ή rejected' }, { status: 400 })
    }
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : ''
    const reviewedBy = request.headers.get('x-admin-email') || 'admin'
    const reviewedAt = new Date().toISOString()

    await ensureGarageSettlementsTable()
    let garageId: string | undefined
    try {
      const res = await dynamoDB.send(new UpdateCommand({
        TableName: TABLES.GarageSettlements,
        Key: { settlementId },
        UpdateExpression: note
          ? 'SET #status = :status, reviewedAt = :at, reviewedBy = :by, reviewNote = :note'
          : 'SET #status = :status, reviewedAt = :at, reviewedBy = :by REMOVE reviewNote',
        ConditionExpression: 'attribute_exists(settlementId)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': body.decision,
          ':at': reviewedAt,
          ':by': reviewedBy,
          ...(note ? { ':note': note } : {}),
        },
        ReturnValues: 'ALL_NEW',
      }))
      garageId = res.Attributes?.garageId as string | undefined
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        return NextResponse.json({ error: 'Η πληρωμή δεν βρέθηκε' }, { status: 404 })
      }
      throw err
    }

    await logEvent({
      eventName: EventName.GarageSettlementReviewed,
      actorType: 'admin',
      actorId: reviewedBy,
      ...(garageId ? { garageId } : {}),
      metadata: { settlementId, decision: body.decision },
    })

    return NextResponse.json({ success: true, status: body.decision, reviewedAt, reviewedBy })
  } catch (error) {
    console.error('Settlement review error:', error)
    return NextResponse.json({ error: 'Failed to update payment' }, { status: 500 })
  }
}

export const PUT = withMetrics(_PUT)
