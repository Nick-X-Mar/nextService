/**
 * NextService — Appointment Completion Sweeper
 *
 * Runs every 15 minutes on an EventBridge schedule. Finds appointments whose slot has
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
 * The same run also reminds clients of offers they have not answered
 * (`remindClientsOfOffers`): 2 hours after the first offer, the next morning and
 * 24 hours after — the trigger is again an absence, the booking that has not
 * happened.
 *
 * Self-contained: only the AWS SDK v3 that ships with the Node.js 20 runtime.
 * No node_modules, no bundler. The email's copy is admin-editable
 * (/admin/emails/templates): an override row `email:completion_prompt_garage`
 * in SiteContent replaces DEFAULT_COPY field by field. DEFAULT_COPY, renderCopy
 * and baseLayout are copies of src/lib/email-templates/{catalog,index,baseLayout}.ts
 * (and of the same functions in new-request-broadcast) — change them together.
 */

import { randomUUID } from 'node:crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand, GetCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses'

const REGION = process.env.AWS_REGION || 'eu-central-1'
const FROM_ADDRESS = process.env.SES_FROM_ADDRESS || 'no-reply@nextservice.gr'
const FROM_NAME = 'NextService'
const APP_URL = (process.env.APP_URL || 'https://nextservice.gr').replace(/\/$/, '')
// Same rule as the app's emailService: only production is on the real domain,
// and every other stage tags the subject it sends.
const SUBJECT_TAG = /(^|\.)nextservice\.gr$/.test(new URL(APP_URL).hostname) ? '' : '[Staging] '
const REQUESTS_TABLE = process.env.SERVICE_REQUESTS_TABLE || 'ServiceRequests'
const GARAGES_TABLE = process.env.GARAGES_TABLE || 'Garages'
const EMAIL_LOGS_TABLE = process.env.EMAIL_LOGS_TABLE || 'EmailLogs'
const SITE_CONTENT_TABLE = process.env.SITE_CONTENT_TABLE || 'SiteContent'
const OFFERS_TABLE = process.env.OFFERS_TABLE || 'Offers'
const CLIENTS_TABLE = process.env.CLIENTS_TABLE || 'Clients'
const VEHICLES_TABLE = process.env.VEHICLES_TABLE || 'Vehicles'
const TEMPLATE_NAME = 'completion_prompt_garage'
const REMINDER_TEMPLATE = 'offer_reminder_client'
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

/*
 * Europe/Athens wall-clock → instant.
 *
 * A copy of src/utils/athensTime.ts (`athensOffsetMinutes` + `athensDateTime`):
 * this Lambda ships without a bundler and cannot import from the Next.js app.
 * The two must agree on when a slot has passed, or the email and the
 * dashboard's own "έγινε η επισκευή;" alert would disagree by an hour every
 * summer — change both files together.
 */
const ATHENS_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Athens',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Athens' offset from UTC at a given instant, in minutes (120 in winter, 180 in summer). */
function athensOffsetMinutes(at) {
  const parts = ATHENS_PARTS.formatToParts(at)
  const get = (type) => Number(parts.find((p) => p.type === type)?.value)
  const wallAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  )
  return Math.round((wallAsUtc - at.getTime()) / 60_000)
}

/** The instant an Athens date + 'HH:MM' refers to, or null if either is malformed. */
function athensDateTime(date, time) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '')
  const t = /^(\d{2}):(\d{2})$/.exec(time || '')
  if (!d || !t) return null

  const wallAsUtc = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2])
  // Date.UTC rolls over instead of failing ('2026-13-01' → January 2027).
  const check = new Date(wallAsUtc)
  if (
    check.getUTCMonth() !== +d[2] - 1 ||
    check.getUTCDate() !== +d[3] ||
    check.getUTCHours() !== +t[1] ||
    check.getUTCMinutes() !== +t[2]
  ) {
    return null
  }

  // Guess with the offset at the wall-clock instant, then re-check at the
  // result: the two differ only within the hour around a DST switch.
  const guess = athensOffsetMinutes(new Date(wallAsUtc))
  let instant = wallAsUtc - guess * 60_000
  const actual = athensOffsetMinutes(new Date(instant))
  if (actual !== guess) instant = wallAsUtc - actual * 60_000
  return new Date(instant)
}

/**
 * When an appointment is over — the same rule as `appointmentEndsAt` in
 * src/types/reviews.ts: its Athens date and time, or the end of the working
 * day when it was booked before hourly slots existed.
 */
function appointmentEndUtc(date, time) {
  const clock = /^\d{2}:\d{2}$/.test(time || '') ? time : ASSUMED_END
  return athensDateTime(date, clock)
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
        // sweep idempotent across runs.
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
  // `2026-10-28` → `28/10/2026`, as the app's own mails print it.
  const when = String(request.appointmentDate || '').replace(/^(\d{4})-(\d{2})-(\d{2})/, (_, y, m, d) => `${d}/${m}/${y}`)
  return { link, values: { 'επωνυμία': companyName, 'ημερομηνία': when } }
}

// ── Email copy ───────────────────────────────────────────────────────────
// A copy of the catalog entry in src/lib/email-templates/catalog.ts.
const DEFAULT_COPY = {
  subject: 'Έγινε η επισκευή; Δήλωσέ το στο NextService',
  heading: 'Έγινε η επισκευή;',
  body:
    'Γεια σου {επωνυμία},\n\n' +
    'Το ραντεβού της **{ημερομηνία}** έχει περάσει και δεν μας έχεις πει τι έγινε.\n\n' +
    'Δήλωσε αν έγινε η εργασία, το ποσό που χρέωσες και πώς σου φάνηκε ο πελάτης. Παίρνει λιγότερο από ένα λεπτό και χρειάζεται για την εκκαθάριση.',
  ctaLabel: 'Δήλωσε την ολοκλήρωση',
  note: ''
}

/** The admin's edited copy over the shipped one, field by field. Never throws. */
async function loadCopy(templateName = TEMPLATE_NAME, defaults = DEFAULT_COPY) {
  try {
    const res = await ddb.send(new GetCommand({
      TableName: SITE_CONTENT_TABLE,
      Key: { pageKey: `email:${templateName}` }
    }))
    return mergeCopy(defaults, res.Item)
  } catch (err) {
    console.error('[sweeper] email copy lookup failed, using the shipped copy:', err)
    return defaults
  }
}

function mergeCopy(defaults, stored) {
  const merged = { ...defaults }
  if (!stored) return merged
  for (const key of Object.keys(defaults)) {
    const value = stored[key]
    if (typeof value === 'string' && (value.trim() || key === 'note' || key === 'heading')) merged[key] = value
  }
  return merged
}

const TOKEN_PATTERN = /\{([^{}\n]{1,40})\}/g

/** A copy of renderDefinition in src/lib/email-templates/index.ts. */
function renderCopy(copy, values, ctaHref) {
  const raw = {}
  for (const [token, value] of Object.entries(values)) raw[token] = String(value ?? '').trim()

  const fillText = (text) => text.replace(TOKEN_PATTERN, (_, token) => raw[token] ?? '')
  const fillHtml = (html) => html.replace(TOKEN_PATTERN, (_, token) => escapeHtml(raw[token] ?? ''))
  const present = (p) => [...p.matchAll(TOKEN_PATTERN)].every(([, token]) => !!raw[token])
  const paragraphs = (text) =>
    text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p && present(p))
  const inline = (escaped) =>
    escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')

  const subject = fillText(copy.subject).replace(/\s+/g, ' ').trim()
  const heading = fillText(copy.heading).trim()
  const body = paragraphs(copy.body)
  const note = paragraphs(copy.note)
  const ctaUrl = ctaHref && copy.ctaLabel.trim() ? escapeHtml(ctaHref) : undefined
  const ctaLabel = ctaUrl ? escapeHtml(copy.ctaLabel.trim()) : undefined

  const bodyHtml = [
    heading ? `<h2 style="margin:0 0 16px 0;font-size:20px;">${fillHtml(inline(escapeHtml(copy.heading.trim())))}</h2>` : '',
    ...body.map((p) => `<p>${fillHtml(inline(escapeHtml(p)))}</p>`)
  ].join('\n')
  const noteHtml = note
    .map((p) => `<p style="margin:20px 0 0 0;color:#6b7280;font-size:13px;">${fillHtml(inline(escapeHtml(p)))}</p>`)
    .join('\n')
  const html = baseLayout({ title: escapeHtml(subject), bodyHtml, ctaLabel, ctaUrl, noteHtml })

  const plain = (p) => fillText(p).replace(/\*\*/g, '')
  const text = [
    heading ? plain(copy.heading.trim()) : '',
    ...body.map(plain),
    ctaUrl ? `${copy.ctaLabel.trim()}: ${ctaHref}` : '',
    ...note.map(plain),
    'NextService'
  ].filter(Boolean).join('\n\n')

  return { subject, html, text }
}

// A copy of src/lib/email-templates/baseLayout.ts.
function baseLayout({ title, bodyHtml, ctaLabel, ctaUrl, noteHtml = '' }) {
  const cta = ctaLabel && ctaUrl
    ? `<p style="margin:32px 0 0 0;text-align:center;">
         <a href="${ctaUrl}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-family:Arial,sans-serif;font-size:16px;">${ctaLabel}</a>
       </p>`
    : ''

  return `<!DOCTYPE html>
<html lang="el">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:#f97316;padding:24px 28px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-family:Arial,sans-serif;">NextService</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;font-size:15px;line-height:1.6;color:#1f2937;">
              ${bodyHtml}
              ${cta}
              ${noteHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px;background:#fafafa;font-size:12px;color:#6b7280;text-align:center;">
              Έλαβες αυτό το email επειδή χρησιμοποιείς το NextService.<br>
              © NextService — Η αγορά συνεργείων αυτοκινήτου.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
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
  const { link, values } = renderEmail(garage.companyName || 'συνεργείο', request)
  await sendRendered({
    to: garage.email,
    templateName: TEMPLATE_NAME,
    triggerEvent: 'service_completion_prompt',
    ids: { garageId: request.acceptedGarageId, requestId: request.id },
    rendered: renderCopy(await loadCopy(), values, link),
  })
}

/** Sends one rendered email through SES and records it in EmailLogs, as the app's emailService does. */
async function sendRendered({ to, templateName, triggerEvent, ids, rendered }) {
  const emailId = randomUUID()
  const base = {
    emailId,
    to: to || '',
    templateName,
    triggerEvent,
    ...ids,
    subject: rendered.subject,
    // The admin's email list and stats query on sentAt; a row without it
    // never showed up there.
    sentAt: new Date().toISOString(),
  }

  if (!NOTIFICATIONS_ENABLED) {
    // Still recorded, so the admin's email view shows what would have gone out.
    await writeEmailLog({ ...base, status: 'skipped' })
    return
  }
  if (!to) {
    await writeEmailLog({ ...base, status: 'failed', errorMessage: 'no email address' })
    return
  }

  await writeEmailLog({ ...base, status: 'queued' })

  try {
    const boundary = `----=_Part_${randomUUID().replace(/-/g, '')}`
    const headers = [
      `From: ${FROM_NAME} <${FROM_ADDRESS}>`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(SUBJECT_TAG + rendered.subject).toString('base64')}?=`,
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
    console.error(`[sweeper] SES failed for ${templateName} (${ids.requestId}):`, errorMessage)
    await writeEmailLog({ ...base, status: 'failed', errorMessage })
  }
}

// ── Offer reminders ──────────────────────────────────────────────────────
// A client with offers and no booking is reminded 2 hours after the first
// offer, the next morning at 09:00 and 24 hours after it (product rule), never
// between 22:00 and 08:00 Athens time. Reminders that fall within two hours of
// each other go out as one. Each is stamped on the request
// (`offerReminder<Stage>At`), which is what keeps a run from repeating one.

const REMINDER_STAGES = [
  { stage: '2h', attr: 'offerReminder2hAt' },
  { stage: 'morning', attr: 'offerReminderMorningAt' },
  { stage: '24h', attr: 'offerReminder24hAt' },
]
const QUIET_FROM_HOUR = 22
const QUIET_UNTIL_HOUR = 8
const MORNING = '09:00'
const MERGE_WINDOW_MS = 2 * 3600_000
/** Past this, every reminder is long sent or no longer worth sending. */
const REMINDER_MAX_AGE_MS = 3 * 86_400_000

// A copy of the category labels in src/utils/categoryLabels.ts.
const CATEGORY_LABELS = {
  service: 'Τακτικό service αυτοκινήτου',
  brakes: 'Φρένα',
  oils: 'Λάδια',
  'allagi-ladion': 'Αλλαγή λαδιών',
  imantas: 'Αλλαγή ιμάντα χρονισμού',
  symplektis: 'Αλλαγή δίσκου πλατό',
  'oliki-vafi': 'Ολική βαφή αυτοκινήτου',
  'meriki-vafi': 'Μερική βαφή αυτοκινήτου',
  aisthitires: 'Τοποθέτηση αισθητήρων παρκαρίσματος',
  fanopeia: 'Φανοποιεία',
  other: 'Πολλαπλές ή Άλλες εργασίες',
}

// A copy of the catalog entry `offer_reminder_client` in
// src/lib/email-templates/catalog.ts.
const REMINDER_DEFAULT_COPY = {
  subject: 'Έχεις {προσφορές} για {κατηγορία}, από {τιμή}€ + ΦΠΑ',
  heading: 'Οι προσφορές σου σε περιμένουν',
  body:
    'Για **{κατηγορία}** στο **{αυτοκίνητο}** έχεις **{προσφορές}**, από **{τιμή}€ + ΦΠΑ**.\n\n' +
    'Σύγκρινε τιμές και ημερομηνίες και κλείσε ραντεβού με όποιο συνεργείο σε εξυπηρετεί. Πληρώνεις απευθείας στο συνεργείο.',
  ctaLabel: 'Δες τις προσφορές',
  note: ''
}

function athensParts(at) {
  const parts = ATHENS_PARTS.formatToParts(at)
  const get = (type) => parts.find((p) => p.type === type)?.value
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) }
}

function isQuiet(at) {
  const { hour } = athensParts(at)
  return hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR
}

/** 09:00 Athens on the day after `at`. */
function nextMorning(at) {
  const [y, m, d] = athensParts(at).date.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
  return athensDateTime(next, MORNING)
}

function reminderSchedule(firstOfferAt) {
  const at = {
    '2h': new Date(firstOfferAt.getTime() + 2 * 3600_000),
    morning: nextMorning(firstOfferAt),
    '24h': new Date(firstOfferAt.getTime() + 24 * 3600_000),
  }
  return REMINDER_STAGES.map((s) => ({ ...s, at: at[s.stage] })).filter((s) => s.at)
}

/** The stages this run sends (as one email), or null to wait. */
function stagesToSend(request, firstOfferAt, now) {
  if (isQuiet(now)) return null
  const open = reminderSchedule(firstOfferAt).filter((s) => !request[s.attr])
  const due = open.filter((s) => s.at <= now)
  if (due.length === 0) return null
  // The next one is close and can go out in waking hours: wait and send them together.
  const upcoming = open.filter((s) => s.at > now).sort((a, b) => a.at - b.at)[0]
  if (upcoming && upcoming.at - now <= MERGE_WINDOW_MS && !isQuiet(upcoming.at)) return null
  return due
}

async function pendingRequestsWithReminders() {
  const found = []
  let startKey
  let pages = 0
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: REQUESTS_TABLE,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        // The last reminder is the 24h one: once it is stamped, nothing is left.
        FilterExpression: 'attribute_not_exists(offerReminder24hAt) AND attribute_not_exists(acceptedOfferId)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': 'pending' },
        ProjectionExpression:
          'id, clientId, vehicleId, category, createdAt, offerReminder2hAt, offerReminderMorningAt, offerReminder24hAt',
        ExclusiveStartKey: startKey,
      })
    )
    for (const item of res.Items || []) {
      if (item.clientId) found.push(item)
    }
    startKey = res.LastEvaluatedKey
    pages++
  } while (startKey && pages < MAX_PAGES)
  return found
}

async function liveOffersOn(requestId) {
  const offers = []
  let startKey
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: OFFERS_TABLE,
        IndexName: 'ServiceRequestOffersIndex',
        KeyConditionExpression: 'serviceRequestId = :id',
        ExpressionAttributeValues: { ':id': requestId },
        ProjectionExpression: 'id, #status, offerAmount, createdAt',
        ExpressionAttributeNames: { '#status': 'status' },
        ExclusiveStartKey: startKey,
      })
    )
    offers.push(...(res.Items || []).filter((o) => o.status === 'pending' && typeof o.offerAmount === 'number'))
    startKey = res.LastEvaluatedKey
  } while (startKey)
  return offers
}

async function remindClientsOfOffers(now) {
  const requests = await pendingRequestsWithReminders()
  let reminded = 0

  for (const request of requests) {
    try {
      const offers = await liveOffersOn(request.id)
      if (offers.length === 0) continue
      const firstOfferAt = new Date(Math.min(...offers.map((o) => new Date(o.createdAt || now).getTime())))
      if (now - firstOfferAt > REMINDER_MAX_AGE_MS) continue
      const stages = stagesToSend(request, firstOfferAt, now)
      if (!stages) continue

      // Stamp first, conditionally: a booking made a moment ago, or a run
      // racing this one, means no email.
      try {
        await ddb.send(new UpdateCommand({
          TableName: REQUESTS_TABLE,
          Key: { id: request.id },
          UpdateExpression: `SET ${stages.map((s, i) => `#r${i} = :now`).join(', ')}`,
          ConditionExpression:
            `#status = :pending AND attribute_not_exists(acceptedOfferId) AND ${stages.map((_, i) => `attribute_not_exists(#r${i})`).join(' AND ')}`,
          ExpressionAttributeNames: {
            '#status': 'status',
            ...Object.fromEntries(stages.map((s, i) => [`#r${i}`, s.attr])),
          },
          ExpressionAttributeValues: { ':now': now.toISOString(), ':pending': 'pending' },
        }))
      } catch (err) {
        if (err?.name !== 'ConditionalCheckFailedException') throw err
        continue
      }

      const [client, vehicle] = await Promise.all([
        ddb.send(new GetCommand({
          TableName: CLIENTS_TABLE,
          Key: { id: request.clientId },
          ProjectionExpression: 'id, email, anonymizedAt, mergedInto',
        })).then((r) => r.Item),
        request.vehicleId ? loadVehicle(request.vehicleId) : null,
      ])
      // A closed account, or a guest merged into another one, gets nothing.
      if (!client?.email || client.anonymizedAt || client.mergedInto) continue

      const cheapest = Math.min(...offers.map((o) => o.offerAmount))
      const values = {
        'αυτοκίνητο': [vehicle?.brand, vehicle?.model].filter(Boolean).join(' '),
        'κατηγορία': CATEGORY_LABELS[request.category] || request.category || '',
        'προσφορές': offers.length === 1 ? '1 προσφορά' : `${offers.length} προσφορές`,
        'τιμή': cheapest.toLocaleString('el-GR', { maximumFractionDigits: 2 }),
      }
      const link = `${APP_URL}/requests/${request.clientId}/details/${request.id}/`
      await sendRendered({
        to: client.email,
        templateName: REMINDER_TEMPLATE,
        triggerEvent: 'offer_reminder',
        ids: { clientId: request.clientId, requestId: request.id },
        rendered: renderCopy(await loadCopy(REMINDER_TEMPLATE, REMINDER_DEFAULT_COPY), values, link),
      })
      reminded++
      console.log(`[sweeper] reminded request=${request.id} stages=${stages.map((s) => s.stage).join('+')} offers=${offers.length}`)
    } catch (err) {
      console.error(`[sweeper] offer reminder failed for ${request.id}:`, err)
    }
  }
  return reminded
}

async function loadVehicle(vehicleId) {
  try {
    const res = await ddb.send(new GetCommand({
      TableName: VEHICLES_TABLE,
      Key: { id: vehicleId },
      ProjectionExpression: 'brand, #model',
      ExpressionAttributeNames: { '#model': 'model' },
    }))
    return res.Item || null
  } catch (err) {
    console.error(`[sweeper] vehicle lookup failed for ${vehicleId}:`, err)
    return null
  }
}

export const handler = async () => {
  const now = new Date()
  const due = await pendingAppointments(now)
  console.log(`[sweeper] ${due.length} appointment(s) awaiting confirmation`)

  let prompted = 0
  let promptedInactive = 0
  for (const request of due) {
    let garage
    try {
      garage = (
        await ddb.send(
          new GetCommand({
            TableName: GARAGES_TABLE,
            Key: { id: request.acceptedGarageId },
            ProjectionExpression: 'id, companyName, email, isActive',
          })
        )
      ).Item
    } catch (err) {
      console.error(`[sweeper] garage lookup failed for ${request.id}:`, err)
      continue
    }
    if (!garage) {
      console.warn(`[sweeper] garage ${request.acceptedGarageId} not found`)
      continue
    }
    // A deactivated garage is prompted too. Deactivation keeps it off the
    // marketplace but leaves its bookings in place, and this is the only nudge
    // to close them: its dashboard lists exactly these jobs (GET
    // /api/garage/booked-jobs) and the completion route accepts them. The
    // email carries only the appointment's date — no client data.
    const inactive = garage.isActive !== true

    try {
      // Stamp first. If the email then fails, the garage still has the in-app
      // alert, and we do not re-send on every run.
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
      await sendPrompt(garage, request)
      prompted++
      if (inactive) promptedInactive++
    } catch (err) {
      console.error(`[sweeper] prompt failed for ${request.id}:`, err)
    }
  }

  console.log(`[sweeper] prompted ${prompted} garage(s), ${promptedInactive} of them deactivated`)

  let reminded = 0
  try {
    reminded = await remindClientsOfOffers(now)
  } catch (err) {
    console.error('[sweeper] offer reminders failed:', err)
  }
  console.log(`[sweeper] reminded ${reminded} client(s) of their offers`)

  return { examined: due.length, prompted, promptedInactive, reminded }
}
