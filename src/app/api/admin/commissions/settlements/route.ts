import { NextResponse } from 'next/server'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { withMetrics } from '@/utils/withMetrics'
import { batchGetById } from '@/utils/batchGetById'
import { collectAll } from '@/utils/pagination'
import { ensureGarageSettlementsTable } from '@/utils/ensureLedgerTables'
import type { Settlement } from '@/types/settlements'
import { TABLES } from '@/lib/tables'

/**
 * GET /api/admin/commissions/settlements — the payments garages have declared
 * and nobody has checked against the bank yet, oldest first, with the garage's
 * name. Each is confirmed or rejected on that garage's commissions page.
 */
async function _GET() {
  try {
    await ensureGarageSettlementsTable()
    const rows = (await collectAll<Record<string, unknown>>(
      (startKey) =>
        dynamoDB.send(new QueryCommand({
          TableName: TABLES.GarageSettlements,
          IndexName: 'StatusIndex',
          KeyConditionExpression: '#status = :declared',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':declared': 'declared' },
          ExclusiveStartKey: startKey,
        })),
      'declared settlements'
    )) as unknown as Settlement[]
    const garages = await batchGetById(TABLES.Garages, rows.map((s) => s.garageId), {
      projection: 'id, companyName, email',
    })
    return NextResponse.json({
      success: true,
      settlements: rows.map((s) => ({
        ...s,
        garageName: (garages.get(s.garageId)?.companyName as string) || (garages.get(s.garageId)?.email as string) || s.garageId,
      })),
    })
  } catch (error) {
    console.error('Declared settlements error:', error)
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
