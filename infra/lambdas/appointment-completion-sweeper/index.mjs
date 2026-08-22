/**
 * NextService — Appointment Completion Sweeper
 *
 * Runs hourly on an EventBridge schedule. Finds appointments whose slot has
 * passed with nobody saying what happened, and asks the garage to confirm the
 * job, declare what it charged, and rate the client.
 *
 * Why a scheduled job rather than something in the request path: the trigger
 * here is the *absence* of an action, which no HTTP request can observe. Before
 * this existed nothing ever moved a request out of APPOINTMENT, so no request
 * reached COMPLETED and the admin's commission report was permanently empty.
 *
 * The in-app alert on the garage dashboard is the primary prompt — it needs no
 * schedule and no email. This Lambda is the out-of-band nudge for a garage that
 * has not opened the dashboard, and it is also what stamps `completionPromptedAt`
 * so the prompt is only ever sent once.
 *
 * Self-contained: only the AWS SDK v3 that ships with the Node.js 20 runtime.
 * No node_modules, no bundler. The email HTML is duplicated from
 * `src/lib/email-templates/baseLayout.ts` for the same reason as in
 * new-request-broadcast — a Lambda cannot import from the Next.js app.
 */

import { randomUUID } from 'node:crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand, GetCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses'

const REGION = process.env.AWS_REGION || 'eu-central-1'
const FROM_ADDRESS = process.env.SES_FROM_ADDRESS || 'no-reply@nextservice.gr'
const FROM_NAME = 'NextService'
const APP_URL = (process.env.APP_URL || 'https://nextservice.gr').replace(/\/$/, '')
const REQUESTS_TABLE = process.env.SERVICE_REQUESTS_TABLE || 'ServiceRequests'
const GARAGES_TABLE = process.env.GARAGES_TABLE || 'Garages'
const EMAIL_LOGS_TABLE = process.env.EMAIL_LOGS_TABLE || 'EmailLogs'
const SES_CONFIG_SET = process.env.SES_CONFIG_SET || ''
const NOTIFICATIONS_ENABLED =
  (process.env.NOTIFICATIONS_ENABLED ?? 'false').toLowerCase() === 'true'

/** Must match COMPLETION_GRACE_HOURS in src/types/reviews.ts. */
const GRACE_HOURS = Number.parseInt(process.env.COMPLETION_GRACE_HOURS || '4', 10)
/** Must match ASSUMED_APPOINTMENT_END in src/types/reviews.ts. */
const ASSUMED_END = '18:00'
/** Stop chasing a job nobody ever closed. */
const MAX_AGE_DAYS = Number.parseInt(process.env.COMPLETION_MAX_AGE_DAYS || '30', 10)
const EMAIL_LOG_TTL_SECONDS = 180 * 24 * 60 * 60
const MAX_PAGES = 20

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }))
const ses = new SESClient({ region: REGION })

/**
 * Appointments carry a local date and an optional 'HH:MM', with no timezone —
 * the whole app does local-midnight arithmetic. Lambda runs in UTC, and Greece
 * is UTC+2/+3, so an appointment is treated as ending at its wall-clock time in
 * Athens. Getting this wrong in the other direction would prompt garages while
 * the car is still on the ramp.
 */
function appointmentEndUtc(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null
  const clock = /^\d{2}:\d{2}$/.test(time || '') ? time : ASSUMED_END
  // Athens is UTC+3 in summer, UTC+2 in winter. Using the smaller offset makes
  // the deadline slightly later rather than earlier — the safe direction.
  const parsed = new Date(`${date}T${clock}:00+02:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function isDue(request, now) {
  const end = appointmentEndUtc(request.appointmentDate, request.appointmentTime)
  if (!end) return false
  const dueAt = end.getTime() + GRACE_HOURS * 3600_000
  if (now.getTime() < dueAt) return false
  // Anything older than the window is abandoned, not pending.
  return now.getTime() - dueAt < MAX_AGE_DAYS * 86_400_000
}

async function pendingAppointments(now) {
  const found = []
  let startKey
  let pages = 0

  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: REQUESTS_TABLE,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        // Only rows nobody has been prompted about yet — this is what makes the
        // sweep idempotent across hourly runs.
        FilterExpression: 'attribute_not_exists(completionPromptedAt)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': 'appointment' },
        ProjectionExpression:
          'id, clientId, acceptedGarageId, appointmentDate, appointmentTime, appointmentPrice',
        ExclusiveStartKey: startKey,
      })
    )
    for (const item of res.Items || []) {
      if (item.acceptedGarageId && isDue(item, now)) found.push(item)
    }
    startKey = res.LastEvaluatedKey
    pages++
  } while (startKey && pages < MAX_PAGES)

  if (startKey) {
    console.warn(`[sweeper] stopped after ${MAX_PAGES} pages — some appointments not examined`)
  }
  return found
}

function renderEmail(companyName, request) {
  const link = `${APP_URL}/login/?next=${encodeURIComponent(
    `/garage-dashboard/${request.acceptedGarageId}/?tab=appointments`
  )}`
  const when = request.appointmentDate
  const subject = 'Έγινε η επισκευή; Δήλωσέ το στο NextService'

  const html = `<!doctype html><html lang="el"><body style="margin:0;padding:0;background:#fbf9f8;font-family:Inter,Arial,sans-serif;color:#1b1c1c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td>
<h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#1b1c1c">Έγινε η επισκευή;</h1>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#5b5f62">
Γεια σου ${escapeHtml(companyName)},<br>
Το ραντεβού της ${escapeHtml(when)} έχει περάσει και δεν μας έχεις πει τι έγινε.
</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#5b5f62">
Μπες και δήλωσε αν έγινε η εργασία, το ποσό που χρέωσες (με ή χωρίς ΦΠΑ) και πώς σου φάνηκε ο πελάτης. Παίρνει λιγότερο από ένα λεπτό και χρειάζεται για την εκκαθάριση.
</p>
<a href="${link}" style="display:inline-block;background:#8a5100;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:12px;font-size:15px;font-weight:700">Δήλωσε την ολοκλήρωση</a>
<p style="margin:24px 0 0;font-size:12px;color:#887361">NextService</p>
</td></tr></table></td></tr></table></body></html>`

  const text = `Έγινε η επισκευή;

Γεια σου ${companyName},
Το ραντεβού της ${when} έχει περάσει και δεν μας έχεις πει τι έγινε.

Δήλωσε αν έγινε η εργασία, το ποσό που χρέωσες (με ή χωρίς ΦΠΑ) και πώς σου φάνηκε ο πελάτης:
${link}

NextService`

  return { subject, html, text }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
}

async function writeEmailLog(record) {
  try {
    await ddb.send(
      new PutCommand({
        TableName: EMAIL_LOGS_TABLE,
        Item: {
          ...record,
          expiresAt: Math.floor(Date.now() / 1000) + EMAIL_LOG_TTL_SECONDS,
        },
      })
    )
  } catch (err) {
    console.error('[sweeper] EmailLogs write failed:', err)
  }
}

async function sendPrompt(garage, request) {
  const emailId = randomUUID()
  const rendered = renderEmail(garage.companyName || 'συνεργείο', request)

  const base = {
    emailId,
    to: garage.email,
    templateName: 'completion_prompt_garage',
    triggerEvent: 'service_completion_prompt',
    garageId: request.acceptedGarageId,
    requestId: request.id,
    subject: rendered.subject,
    createdAt: new Date().toISOString(),
  }

  if (!NOTIFICATIONS_ENABLED) {
    // Still recorded, so the admin's email view shows what would have gone out.
    await writeEmailLog({ ...base, status: 'skipped' })
    return
  }
  if (!garage.email) {
    await writeEmailLog({ ...base, status: 'failed', errorMessage: 'no email on garage' })
    return
  }

  await writeEmailLog({ ...base, status: 'pending' })

  try {
    const boundary = `----=_Part_${randomUUID().replace(/-/g, '')}`
    const headers = [
      `From: ${FROM_NAME} <${FROM_ADDRESS}>`,
      `To: ${garage.email}`,
      `Subject: =?UTF-8?B?${Buffer.from(rendered.subject).toString('base64')}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      `X-Mailer: NextService`,
      `X-Nextservice-EmailId: ${emailId}`,
    ]
    if (SES_CONFIG_SET) headers.push(`X-SES-CONFIGURATION-SET: ${SES_CONFIG_SET}`)

    const raw = [
      ...headers,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      Buffer.from(rendered.text).toString('base64'),
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      Buffer.from(rendered.html).toString('base64'),
      ``,
      `--${boundary}--`,
    ].join('\r\n')

    const result = await ses.send(
      new SendRawEmailCommand({ RawMessage: { Data: Buffer.from(raw) } })
    )
    await writeEmailLog({ ...base, status: 'sent', sesMessageId: result.MessageId })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown SES error'
    console.error(`[sweeper] SES failed for ${garage.email}:`, errorMessage)
    await writeEmailLog({ ...base, status: 'failed', errorMessage })
  }
}

export const handler = async () => {
  const now = new Date()
  const due = await pendingAppointments(now)
  console.log(`[sweeper] ${due.length} appointment(s) awaiting confirmation`)

  let prompted = 0
  for (const request of due) {
    try {
      // Stamp first. If the email then fails, the garage still has the in-app
      // alert, and we do not re-send on every hourly run.
      await ddb.send(
        new UpdateCommand({
          TableName: REQUESTS_TABLE,
          Key: { id: request.id },
          UpdateExpression: 'SET completionPromptedAt = :now',
          ConditionExpression:
            'attribute_not_exists(completionPromptedAt) AND #status = :appointment',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':now': now.toISOString(), ':appointment': 'appointment' },
        })
      )
    } catch (err) {
      // Another run got there first, or the garage closed it in the meantime.
      if (err?.name !== 'ConditionalCheckFailedException') {
        console.error(`[sweeper] stamp failed for ${request.id}:`, err)
      }
      continue
    }

    try {
      const garage = await ddb.send(
        new GetCommand({
          TableName: GARAGES_TABLE,
          Key: { id: request.acceptedGarageId },
          ProjectionExpression: 'id, companyName, email',
        })
      )
      if (!garage.Item) {
        console.warn(`[sweeper] garage ${request.acceptedGarageId} not found`)
        continue
      }
      await sendPrompt(garage.Item, request)
      prompted++
    } catch (err) {
      console.error(`[sweeper] prompt failed for ${request.id}:`, err)
    }
  }

  console.log(`[sweeper] prompted ${prompted} garage(s)`)
  return { examined: due.length, prompted }
}
