import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { getAdminFromRequest } from '@/utils/adminAuth'
import { withMetrics } from '@/utils/withMetrics'
import { createTtlCache } from '@/utils/ttlCache'
import { ensurePaymentsTable } from '@/utils/ensurePaymentTables'

/**
 * What needs an admin's attention right now.
 *
 * These numbers already existed — they were just invisible until someone
 * thought to open the right page and look. Surfacing them in the shell is the
 * difference between noticing a stuck approval in an hour and in a week.
 *
 * Counting means scanning: none of these have an index that answers "how many
 * are in state X", and adding three GSIs for an admin banner is not worth the
 * write cost. The cache keeps the scans to one set per minute per container.
 */

interface AdminAlerts {
  pendingGarages: number
  failedPayments: number
  openErrorGroups: number
}

const cache = createTtlCache<AdminAlerts>(60_000)

async function compute(): Promise<AdminAlerts> {
  const paymentsTable = process.env.PAYMENTS_TABLE || 'Payments'
  const errorsTable = process.env.ERROR_RESOLUTIONS_TABLE || 'ErrorResolutions'

  const [garages, payments, errors] = await Promise.all([
    dynamoDB.send(new ScanCommand({
      TableName: 'Garages',
      FilterExpression: 'attribute_not_exists(isActive) OR isActive = :false',
      ExpressionAttributeValues: { ':false': false },
      Select: 'COUNT',
    })).catch(() => ({ Count: 0 })),

    ensurePaymentsTable()
      .then(() => dynamoDB.send(new ScanCommand({
        TableName: paymentsTable,
        FilterExpression: '#s = :failed',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':failed': 'failed' },
        Select: 'COUNT',
      })))
      .catch(() => ({ Count: 0 })),

    dynamoDB.send(new ScanCommand({
      TableName: errorsTable,
      FilterExpression: '#s = :open',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':open': 'open' },
      Select: 'COUNT',
    })).catch(() => ({ Count: 0 })),
  ])

  return {
    pendingGarages: garages.Count ?? 0,
    failedPayments: payments.Count ?? 0,
    openErrorGroups: errors.Count ?? 0,
  }
}

async function _GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const alerts = await cache.getOrCompute('admin', compute)
    return NextResponse.json({ success: true, ...alerts })
  } catch (error) {
    console.error('Error computing admin alerts:', error)
    return NextResponse.json({ error: 'Error computing admin alerts' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
