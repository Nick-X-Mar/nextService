import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { requireGarage } from '@/utils/requireAuth'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'
import { logEvent } from '@/utils/eventLogger'
import { garageLedger } from '@/utils/garageLedger'
import { ensureGarageSettlementsTable } from '@/utils/ensureLedgerTables'
import { athensToday } from '@/utils/athensTime'
import { roundCents } from '@/lib/commission-basis'
import { EventName } from '@/types/events'
import { SETTLEMENT_METHODS, type Settlement } from '@/types/settlements'
import { TABLES } from '@/lib/tables'

const checkRate = createRateLimiter('garage-settlement', 20, 3600000)

/**
 * The garage's Πληρωμές tab. `requireGarage`, not `requireActiveGarage`: a
 * deactivated garage still owes the commission on jobs it did, and must still
 * be able to see it and say it paid.
 */
async function _GET(request: NextRequest) {
  try {
    const garageId = requireGarage(request)
    if (garageId instanceof NextResponse) return garageId
    return NextResponse.json({ success: true, ...(await garageLedger(garageId)) })
  } catch (error) {
    console.error('Error loading garage payments:', error)
    return NextResponse.json({ error: 'Σφάλμα φόρτωσης πληρωμών' }, { status: 500 })
  }
}

/**
 * The garage says it paid NextService. It counts against the balance at once
 * and waits for an admin to match it to the bank.
 */
async function _POST(request: NextRequest) {
  try {
    const garageId = requireGarage(request)
    if (garageId instanceof NextResponse) return garageId

    if (!checkRate(garageId)) {
      return NextResponse.json({ error: 'Πάρα πολλές αιτήσεις. Δοκιμάστε αργότερα.' }, { status: 429 })
    }

    const body = (await request.json().catch(() => null)) ?? {}
    const amount = typeof body.amount === 'number' ? roundCents(body.amount) : NaN
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
      return NextResponse.json({ error: 'Γράψε το ποσό που πλήρωσες.' }, { status: 400 })
    }
    const paidOn = typeof body.paidOn === 'string' ? body.paidOn : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || Number.isNaN(Date.parse(paidOn)) || paidOn < '2024-01-01') {
      return NextResponse.json({ error: 'Διάλεξε την ημερομηνία πληρωμής.' }, { status: 400 })
    }
    if (paidOn > athensToday()) {
      return NextResponse.json({ error: 'Η ημερομηνία πληρωμής δεν μπορεί να είναι μελλοντική.' }, { status: 400 })
    }
    if (!SETTLEMENT_METHODS.some((m) => m.code === body.method)) {
      return NextResponse.json({ error: 'Διάλεξε τον τρόπο πληρωμής.' }, { status: 400 })
    }
    const reference = typeof body.reference === 'string' ? body.reference.trim().slice(0, 200) : ''

    await ensureGarageSettlementsTable()
    const settlement: Settlement = {
      settlementId: `stl_${randomUUID()}`,
      garageId,
      amount,
      paidOn,
      method: body.method,
      ...(reference ? { reference } : {}),
      status: 'declared',
      createdAt: new Date().toISOString(),
    }
    await dynamoDB.send(new PutCommand({
      TableName: TABLES.GarageSettlements,
      Item: settlement,
      ConditionExpression: 'attribute_not_exists(settlementId)',
    }))

    await logEvent({
      eventName: EventName.GarageSettlementDeclared,
      actorType: 'garage',
      actorId: garageId,
      garageId,
      metadata: { amount, method: settlement.method },
    })

    return NextResponse.json({ success: true, settlement })
  } catch (error) {
    console.error('Error declaring garage payment:', error)
    return NextResponse.json({ error: 'Δεν καταχωρήθηκε. Δοκίμασε ξανά.' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
export const POST = withMetrics(_POST)
