import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { ensureEventLogsTable } from '@/utils/ensureEventTables'
import { EventName } from '@/types/events'
import { withMetrics } from '@/utils/withMetrics'
import { createTtlCache } from '@/utils/ttlCache'
import { TABLES } from '@/lib/tables'

// Each step of the request form, its fields in the order they appear on screen,
// and the event that closes the step. Counted per visitor (visitId), against
// the visits that opened the step — so the drop from one field to the next is
// the people who stopped there. Fields come from useFieldTracking.
const STEPS = [
  {
    step: 'car_details',
    label: 'Βήμα 1 — Αυτοκίνητο',
    startEvent: EventName.CarDetailsStarted,
    endEvent: EventName.CarDetailsCompleted,
    endLabel: 'Πάτησε «Συνέχεια»',
    fields: [
      { field: 'description', label: 'Περιγραφή (προαιρετική, υποχρεωτική στις «Άλλες εργασίες»)' },
      { field: 'brand', label: 'Μάρκα' },
      { field: 'model', label: 'Μοντέλο' },
      { field: 'year', label: 'Χρονολογία' },
      { field: 'engine_cc', label: 'Κυβικά (όχι στη βαφή)' },
    ],
  },
  {
    step: 'car_specs',
    label: 'Βήμα 2 — Στοιχεία και αποστολή',
    startEvent: EventName.CarSpecsStarted,
    endEvent: EventName.ServiceRequestSubmitted,
    endLabel: 'Έστειλε το αίτημα',
    fields: [
      { field: 'signed_in', label: 'Ήταν ήδη συνδεδεμένος' },
      { field: 'email', label: 'Email' },
      { field: 'email_taken', label: 'Το email είχε ήδη λογαριασμό' },
      { field: 'phone', label: 'Κινητό' },
      { field: 'terms', label: 'Αποδοχή όρων' },
      { field: 'license_photo', label: 'Φωτογραφία άδειας' },
      { field: 'vin', label: 'Αριθμός πλαισίου' },
      { field: 'engine_number', label: 'Αριθμός κινητήρα' },
      { field: 'damage_photos', label: 'Φωτογραφίες ζημιάς (βαφή)' },
    ],
  },
] as const

interface EventRow {
  visitId?: string
  metadata?: Record<string, unknown>
}

interface FieldRow {
  field: string
  label: string
  count: number
  percent: number
}

interface StepReport {
  step: string
  label: string
  started: number
  fields: FieldRow[]
  completed: { label: string; count: number; percent: number }
}

interface FieldsResponse {
  from: string
  to: string
  category: string
  /** Categories seen in the range, for the filter. */
  categories: string[]
  steps: StepReport[]
}

const cache = createTtlCache<FieldsResponse>(5 * 60_000)

async function eventsNamed(eventName: string, fromIso: string, toIso: string): Promise<EventRow[]> {
  const rows: EventRow[] = []
  let lastEvaluatedKey: Record<string, unknown> | undefined
  for (let i = 0; i < 50; i++) {
    const res = await dynamoDB.send(new QueryCommand({
      TableName: TABLES.EventLogs,
      IndexName: 'EventNameIndex',
      KeyConditionExpression: 'eventName = :name AND #ts BETWEEN :from AND :to',
      ExpressionAttributeNames: { '#ts': 'timestamp' },
      ExpressionAttributeValues: { ':name': eventName, ':from': fromIso, ':to': toIso },
      ProjectionExpression: 'visitId, metadata',
      ExclusiveStartKey: lastEvaluatedKey,
    }))
    rows.push(...((res.Items || []) as EventRow[]))
    if (!res.LastEvaluatedKey) break
    lastEvaluatedKey = res.LastEvaluatedKey
  }
  return rows
}

const categoryOf = (row: EventRow) => (typeof row.metadata?.category === 'string' ? row.metadata.category : '')
const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 1000) / 10 : 0)

async function compute(fromIso: string, toIso: string, category: string): Promise<FieldsResponse> {
  await ensureEventLogsTable()

  const [fieldEvents, ...stepEvents] = await Promise.all([
    eventsNamed(EventName.FormFieldFilled, fromIso, toIso),
    ...STEPS.flatMap((s) => [eventsNamed(s.startEvent, fromIso, toIso), eventsNamed(s.endEvent, fromIso, toIso)]),
  ])

  const categories = new Set<string>()
  for (const row of [...fieldEvents, ...stepEvents.flat()]) {
    const c = categoryOf(row)
    if (c) categories.add(c)
  }

  const steps = STEPS.map((s, i) => {
    const starts = stepEvents[i * 2]
    const ends = stepEvents[i * 2 + 1]
    // The visits that opened this step for the chosen category.
    const started = new Set(
      starts
        .filter((r) => r.visitId && (!category || categoryOf(r) === category))
        .map((r) => r.visitId as string)
    )
    const filledBy = new Map<string, Set<string>>()
    for (const row of fieldEvents) {
      if (row.metadata?.step !== s.step || !row.visitId || !started.has(row.visitId)) continue
      const field = String(row.metadata.field ?? '')
      if (!filledBy.has(field)) filledBy.set(field, new Set())
      filledBy.get(field)!.add(row.visitId)
    }
    const completed = new Set(ends.filter((r) => r.visitId && started.has(r.visitId)).map((r) => r.visitId as string))

    return {
      step: s.step,
      label: s.label,
      started: started.size,
      fields: s.fields.map((f) => {
        const count = filledBy.get(f.field)?.size ?? 0
        return { field: f.field, label: f.label, count, percent: pct(count, started.size) }
      }),
      completed: { label: s.endLabel, count: completed.size, percent: pct(completed.size, started.size) },
    }
  })

  return { from: fromIso, to: toIso, category, categories: [...categories].sort(), steps }
}

/** GET /api/admin/funnel/fields?from=&to=&category= — the request form, field by field. */
async function _GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')
    const category = (searchParams.get('category') || '').slice(0, 40)

    const now = new Date()
    const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const fromIso = fromParam ? `${fromParam}T00:00:00.000Z` : defaultFrom.toISOString()
    const toIso = toParam ? `${toParam}T23:59:59.999Z` : now.toISOString()

    const data = await cache.getOrCompute(`${fromIso}|${toIso}|${category}`, () => compute(fromIso, toIso, category))
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, max-age=300' } })
  } catch (err) {
    console.error('[admin/funnel/fields] error:', err)
    return NextResponse.json({ error: 'Failed to compute form fields' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
