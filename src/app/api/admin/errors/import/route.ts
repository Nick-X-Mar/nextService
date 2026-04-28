import { NextRequest, NextResponse } from 'next/server'
import { PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import {
  ensureErrorResolutionsTable,
  ERROR_RESOLUTIONS_TABLE
} from '@/utils/ensureErrorResolutionsTable'
import { withMetrics } from '@/utils/withMetrics'

interface IncomingResolution {
  fingerprint?: unknown
  status?: unknown
  notes?: unknown
}

interface ImportPayload {
  version?: unknown
  resolutions?: unknown
  filename?: unknown
}

const FINGERPRINT_RE = /^err_[a-f0-9]{8}$/

async function readPayload(request: NextRequest): Promise<ImportPayload | null> {
  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return null
    const text = await file.text()
    try {
      const parsed = JSON.parse(text) as ImportPayload
      parsed.filename = file.name
      return parsed
    } catch {
      return null
    }
  }
  try {
    return (await request.json()) as ImportPayload
  } catch {
    return null
  }
}

async function _POST(request: NextRequest) {
  const payload = await readPayload(request)
  if (!payload) {
    return NextResponse.json({ error: 'Invalid file — expected JSON' }, { status: 400 })
  }
  if (payload.version !== 1) {
    return NextResponse.json(
      { error: 'Unsupported version — expected { "version": 1 }' },
      { status: 400 }
    )
  }
  if (!Array.isArray(payload.resolutions)) {
    return NextResponse.json(
      { error: 'Missing "resolutions" array' },
      { status: 400 }
    )
  }

  await ensureErrorResolutionsTable()

  const filename = typeof payload.filename === 'string' ? payload.filename : undefined
  const adminEmail = request.headers.get('x-user-email') || 'admin'
  const now = new Date().toISOString()

  const applied: string[] = []
  const cleared: string[] = []
  const errors: { fingerprint?: string; reason: string }[] = []

  for (const raw of payload.resolutions as IncomingResolution[]) {
    const fp = typeof raw?.fingerprint === 'string' ? raw.fingerprint : undefined
    const status = typeof raw?.status === 'string' ? raw.status : undefined
    const notes = typeof raw?.notes === 'string' ? raw.notes : undefined

    if (!fp || !FINGERPRINT_RE.test(fp)) {
      errors.push({ fingerprint: fp, reason: 'Invalid fingerprint format' })
      continue
    }
    if (status !== 'resolved' && status !== 'ignored' && status !== 'open') {
      errors.push({ fingerprint: fp, reason: `Invalid status "${status ?? ''}"` })
      continue
    }

    try {
      if (status === 'open') {
        await dynamoDB.send(
          new DeleteCommand({
            TableName: ERROR_RESOLUTIONS_TABLE,
            Key: { fingerprint: fp }
          })
        )
        cleared.push(fp)
      } else {
        await dynamoDB.send(
          new PutCommand({
            TableName: ERROR_RESOLUTIONS_TABLE,
            Item: {
              fingerprint: fp,
              status,
              notes,
              resolvedAt: now,
              resolvedBy: adminEmail,
              ...(filename ? { lastImportFile: filename } : {})
            }
          })
        )
        applied.push(fp)
      }
    } catch (err) {
      errors.push({
        fingerprint: fp,
        reason: err instanceof Error ? err.message : 'Unknown error'
      })
    }
  }

  return NextResponse.json({
    appliedCount: applied.length,
    clearedCount: cleared.length,
    errorsCount: errors.length,
    applied,
    cleared,
    errors
  })
}

export const POST = withMetrics(_POST)
