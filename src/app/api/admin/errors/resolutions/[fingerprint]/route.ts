import { NextRequest, NextResponse } from 'next/server'
import { PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import {
  ensureErrorResolutionsTable,
  ERROR_RESOLUTIONS_TABLE
} from '@/utils/ensureErrorResolutionsTable'
import { withMetrics } from '@/utils/withMetrics'

const FINGERPRINT_RE = /^err_[a-f0-9]{8}$/

interface RouteContext {
  params: Promise<{ fingerprint: string }>
}

async function _POST(request: NextRequest, context: RouteContext) {
  const { fingerprint } = await context.params
  if (!FINGERPRINT_RE.test(fingerprint)) {
    return NextResponse.json({ error: 'Invalid fingerprint' }, { status: 400 })
  }

  let body: { status?: unknown; notes?: unknown; sampleMessage?: unknown; logGroup?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const status = body.status
  if (status !== 'resolved' && status !== 'ignored') {
    return NextResponse.json(
      { error: 'status must be "resolved" or "ignored"' },
      { status: 400 }
    )
  }

  await ensureErrorResolutionsTable()

  const adminEmail = request.headers.get('x-user-email') || 'admin'
  const now = new Date().toISOString()

  await dynamoDB.send(
    new PutCommand({
      TableName: ERROR_RESOLUTIONS_TABLE,
      Item: {
        fingerprint,
        status,
        notes: typeof body.notes === 'string' ? body.notes : undefined,
        sampleMessage: typeof body.sampleMessage === 'string' ? body.sampleMessage : undefined,
        logGroup: typeof body.logGroup === 'string' ? body.logGroup : undefined,
        resolvedAt: now,
        resolvedBy: adminEmail
      }
    })
  )

  return NextResponse.json({ ok: true, fingerprint, status, resolvedAt: now })
}

async function _DELETE(_request: NextRequest, context: RouteContext) {
  const { fingerprint } = await context.params
  if (!FINGERPRINT_RE.test(fingerprint)) {
    return NextResponse.json({ error: 'Invalid fingerprint' }, { status: 400 })
  }

  await ensureErrorResolutionsTable()

  await dynamoDB.send(
    new DeleteCommand({
      TableName: ERROR_RESOLUTIONS_TABLE,
      Key: { fingerprint }
    })
  )

  return NextResponse.json({ ok: true, fingerprint, status: 'open' })
}

export const POST = withMetrics(_POST)
export const DELETE = withMetrics(_DELETE)
