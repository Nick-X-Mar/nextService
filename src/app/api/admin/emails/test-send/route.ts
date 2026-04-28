import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { sendEmail, isNotificationsEnabled } from '@/utils/emailService'
import { ensureEmailLogsTable } from '@/utils/ensureEventTables'
import { withMetrics } from '@/utils/withMetrics'
import { EmailTemplate } from '@/types/events'

// Admin-triggered test send. Lets the operator verify the full pipeline:
//   1. SES SendRawEmail accepts the message  → status moves queued → sent
//   2. SES Configuration Set publishes events → status moves sent → delivered
//   3. Recipient opens / clicks               → status moves to opened/clicked
//
// The poll endpoint below returns the current EmailLogs row so the admin UI
// can show the lifecycle progress in real time.

interface TestSendRequest {
  to?: string
}

async function _POST(request: NextRequest): Promise<NextResponse> {
  await ensureEmailLogsTable()

  let body: TestSendRequest = {}
  try {
    body = (await request.json()) as TestSendRequest
  } catch {
    /* empty body is fine — we'll fall back to ADMIN_EMAIL */
  }

  const adminEmail = request.headers.get('x-admin-email') || ''
  const to = (body.to || adminEmail || process.env.ADMIN_EMAIL || '').trim()
  if (!to || !to.includes('@')) {
    return NextResponse.json(
      { error: 'No recipient — pass `to` in the body or set ADMIN_EMAIL.' },
      { status: 400 }
    )
  }

  if (!isNotificationsEnabled()) {
    return NextResponse.json(
      {
        error:
          'NOTIFICATIONS_ENABLED is false. Set it to true in Amplify env vars to send real emails.',
        notificationsEnabled: false
      },
      { status: 412 }
    )
  }

  // Use the existing welcome_garage template — guaranteed to render and
  // contains a clickable link, so we can verify both the open pixel and
  // the click-tracking redirect work.
  const before = Date.now()
  sendEmail({
    to,
    templateName: EmailTemplate.WelcomeGarage,
    variables: { companyName: `Pipeline test ${new Date().toISOString()}` },
    triggerEvent: 'admin_test_email'
  })

  // Give the fire-and-forget call a moment to write the queued row before
  // the admin starts polling.
  await new Promise((r) => setTimeout(r, 250))

  return NextResponse.json({
    ok: true,
    to,
    triggeredAt: new Date(before).toISOString(),
    note: 'Poll /api/admin/emails/test-send?to=<recipient> to see the lifecycle.'
  })
}

// Polling helper — returns the most recent admin_test_email row for the
// given recipient. Lets the admin UI show real-time lifecycle progression.
async function _GET(request: NextRequest): Promise<NextResponse> {
  await ensureEmailLogsTable()
  const { searchParams } = new URL(request.url)
  const to = searchParams.get('to')
  if (!to) {
    return NextResponse.json({ error: 'Missing `to`' }, { status: 400 })
  }

  // Query the RecipientIndex (to, sentAt) for this recipient, descending,
  // limit 5 — pick the most recent admin_test_email row.
  const result = await dynamoDB.send(
    new QueryCommand({
      TableName: 'EmailLogs',
      IndexName: 'RecipientIndex',
      KeyConditionExpression: '#to = :to',
      ExpressionAttributeNames: { '#to': 'to' },
      ExpressionAttributeValues: { ':to': to },
      ScanIndexForward: false,
      Limit: 5
    })
  )

  // Find the latest admin_test_email row.
  const items = (result.Items || []).filter(
    (it) => it.triggerEvent === 'admin_test_email'
  )
  const row = items[0]
  if (!row) {
    return NextResponse.json({ found: false })
  }

  // Project just the fields the UI needs. Avoid leaking the full row.
  return NextResponse.json({
    found: true,
    emailId: row.emailId,
    status: row.status,
    sentAt: row.sentAt,
    deliveredAt: row.deliveredAt,
    openedAt: row.openedAt,
    clickedAt: row.clickedAt,
    bouncedAt: row.bouncedAt,
    complainedAt: row.complainedAt,
    sesMessageId: row.sesMessageId,
    errorMessage: row.errorMessage
  })
}

// Admin auth is enforced by middleware.ts for every /api/admin/* route.
export const POST = withMetrics(_POST)
export const GET = withMetrics(_GET)
