import { NextRequest, NextResponse } from 'next/server'
import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { withMetrics } from '@/utils/withMetrics'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import { DEFAULT_COMMISSION_PERCENT, parseCommissionPercent } from '@/lib/commission-basis'
import { TABLES } from '@/lib/tables'

/**
 * PUT /api/admin/commissions/garage/[garageId]/rate
 * Body: { commissionPercent: number | null } — null returns the garage to the default.
 *
 * Applies to jobs the garage completes from now on: each completion freezes
 * the rate in force on the job, so months already billed keep theirs. The
 * admin and the time are recorded with the rate.
 */
async function _PUT(
  request: NextRequest,
  { params }: { params: Promise<{ garageId: string }> }
) {
  try {
    const { garageId } = await params
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || !('commissionPercent' in body)) {
      return NextResponse.json({ error: 'Λείπει το ποσοστό' }, { status: 400 })
    }
    const raw = (body as { commissionPercent: unknown }).commissionPercent
    const percent = raw === null ? null : parseCommissionPercent(raw)
    if (raw !== null && percent === null) {
      return NextResponse.json({ error: 'Το ποσοστό πρέπει να είναι από 0 έως 100' }, { status: 400 })
    }

    const adminEmail = request.headers.get('x-admin-email') || 'admin'
    const now = new Date().toISOString()
    try {
      await dynamoDB.send(new UpdateCommand({
        TableName: TABLES.Garages,
        Key: { id: garageId },
        UpdateExpression: percent === null
          ? 'SET commissionPercentSetAt = :now, commissionPercentSetBy = :by REMOVE commissionPercent'
          : 'SET commissionPercent = :p, commissionPercentSetAt = :now, commissionPercentSetBy = :by',
        // Without the condition an unknown id would create a bare garage row.
        ConditionExpression: 'attribute_exists(id)',
        ExpressionAttributeValues: {
          ':now': now,
          ':by': adminEmail,
          ...(percent === null ? {} : { ':p': percent }),
        },
      }))
    } catch (err) {
      if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
        return NextResponse.json({ error: 'Το συνεργείο δεν βρέθηκε' }, { status: 404 })
      }
      throw err
    }

    await logEvent({
      eventName: EventName.GarageCommissionRateChanged,
      actorType: 'admin',
      actorId: request.headers.get('x-admin-id') || 'admin',
      garageId,
      source: 'admin/commissions',
      metadata: { commissionPercent: percent ?? DEFAULT_COMMISSION_PERCENT, custom: percent !== null },
    })

    return NextResponse.json({
      success: true,
      commissionPercent: percent ?? DEFAULT_COMMISSION_PERCENT,
      hasCustomRate: percent !== null,
      rateSetAt: now,
      rateSetBy: adminEmail,
    })
  } catch (error) {
    console.error('Garage commission rate error:', error)
    return NextResponse.json({ error: 'Failed to update commission rate' }, { status: 500 })
  }
}

export const PUT = withMetrics(_PUT)
