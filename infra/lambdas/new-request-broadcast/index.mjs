/**
 * NextService — New Request Broadcast Lambda
 *
 * Triggered by the DynamoDB Stream on the `ServiceRequests` table. For every
 * new INSERT, fans out an email to every active garage with a per-recipient
 * CTA link back into their dashboard. Writes a row to `EmailLogs` for each
 * attempt so the admin dashboard can report deliverability.
 *
 * Self-contained — uses only the AWS SDK v3 that ships with the Node.js 20
 * Lambda runtime. No `node_modules`, no bundler.
 *
 * The email's copy is admin-editable (/admin/emails/templates): an override row
 * `email:new_request_for_garages` in SiteContent replaces the shipped copy below,
 * field by field. DEFAULT_COPY, renderCopy and baseLayout are copies of
 * src/lib/email-templates/{catalog,index,baseLayout}.ts — change one, change both.
 */

import { randomUUID } from 'node:crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
  PutCommand,
  UpdateCommand
} from '@aws-sdk/lib-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses'

const REGION = process.env.AWS_REGION || 'eu-central-1'
const FROM_ADDRESS = process.env.SES_FROM_ADDRESS || 'no-reply@nextservice.gr'
const FROM_NAME = 'NextService'
const APP_URL = (process.env.APP_URL || 'https://nextservice.gr').replace(/\/$/, '')
const GARAGES_TABLE = process.env.GARAGES_TABLE || 'Garages'
const VEHICLES_TABLE = process.env.VEHICLES_TABLE || 'Vehicles'
const EMAIL_LOGS_TABLE = process.env.EMAIL_LOGS_TABLE || 'EmailLogs'
const SITE_CONTENT_TABLE = process.env.SITE_CONTENT_TABLE || 'SiteContent'
const TEMPLATE_NAME = 'new_request_for_garages'
// Name of the SES Configuration Set defined in notifications_stack.py.
// Empty string disables tagging (e.g. for local/ad-hoc testing).
const SES_CONFIG_SET = process.env.SES_CONFIG_SET || ''
const NOTIFICATIONS_ENABLED =
  (process.env.NOTIFICATIONS_ENABLED ?? 'false').toLowerCase() === 'true'
const SEND_CONCURRENCY = Number.parseInt(process.env.SEND_CONCURRENCY || '10', 10)
const EMAIL_LOG_TTL_SECONDS = 180 * 24 * 60 * 60

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }))
const ses = new SESClient({ region: REGION })

// Greek labels for the request categories. A copy of the map in
// src/utils/categoryLabels.ts — this Lambda ships without a bundler and cannot
// import it — so keep the two in step. Without it the email printed the raw
// slug, e.g. "(oliki-vafi)".
const CATEGORY_LABELS = {
  service: 'Service Αυτοκινήτων',
  brakes: 'Φρένα',
  oils: 'Λάδια',
  'allagi-ladion': 'Αλλαγή Λαδιών',
  imantas: 'Ιμάντας Χρονισμού',
  symplektis: 'Δίσκος Πλατό',
  'oliki-vafi': 'Ολική Βαφή',
  'meriki-vafi': 'Μερική Βαφή',
  aisthitires: 'Αισθητήρες Παρκαρίσματος',
  fanopeia: 'Φανοποιεία',
  disk: 'Δισκόφρενα',
  tires: 'Λάστιχα',
  engine: 'Κινητήρας',
  electrical: 'Ηλεκτρικά',
  kteo: 'ΚΤΕΟ',
  elastika: 'Ελαστικά'
}

function categoryLabel(category) {
  return CATEGORY_LABELS[category] || category || ''
}

export const handler = async (event) => {
  const records = Array.isArray(event?.Records) ? event.Records : []
  for (const record of records) {
    if (record.eventName !== 'INSERT') continue
    try {
      const newImage = record?.dynamodb?.NewImage
      if (!newImage) continue
      const request = unmarshall(newImage)
      await broadcastToGarages(request)
    } catch (err) {
      // Swallow per-record errors so a single bad row doesn't poison the
      // whole batch (which would cause the stream shard to replay forever).
      console.error('[broadcast] Record failed:', err)
    }
  }
  return { statusCode: 200, processed: records.length }
}

async function broadcastToGarages(request) {
  const requestId = request?.id
  if (!requestId) {
    console.warn('[broadcast] Skipping record with no id')
    return
  }

  // The request row carries only `vehicleId`; brand and model live on the
  // vehicle. Reading `request.brand` is why the email never named the car.
  const vehicle = await loadVehicle(request.vehicleId)
  const copy = await loadCopy()

  // Only approved garages. `isActive = :active` with a boolean true matches
  // the BOOL attribute exactly, the same test login and requireActiveGarage
  // apply — a pending or deactivated garage (false, or no attribute) gets
  // nothing.
  const garages = []
  let ExclusiveStartKey
  do {
    const page = await ddb.send(new ScanCommand({
      TableName: GARAGES_TABLE,
      FilterExpression: 'isActive = :active',
      ExpressionAttributeValues: { ':active': true },
      ProjectionExpression: 'id, email, companyName, isActive',
      ExclusiveStartKey
    }))
    for (const g of page.Items || []) {
      if (g?.isActive === true) garages.push(g)
    }
    ExclusiveStartKey = page.LastEvaluatedKey
  } while (ExclusiveStartKey)

  console.log(
    `[broadcast] request=${requestId} active_garages=${garages.length}`
  )

  for (let i = 0; i < garages.length; i += SEND_CONCURRENCY) {
    const slice = garages.slice(i, i + SEND_CONCURRENCY)
    await Promise.all(
      slice.map((g) =>
        sendToGarage(g, request, vehicle, copy).catch((err) => {
          console.error(`[broadcast] garage=${g?.id} failed:`, err)
        })
      )
    )
  }
}

async function loadVehicle(vehicleId) {
  if (typeof vehicleId !== 'string' || !vehicleId) return null
  try {
    const res = await ddb.send(new GetCommand({
      TableName: VEHICLES_TABLE,
      Key: { id: vehicleId },
      ProjectionExpression: 'brand, model'
    }))
    return res.Item || null
  } catch (err) {
    // The email is still worth sending without the car in it.
    console.error(`[broadcast] vehicle=${vehicleId} lookup failed:`, err)
    return null
  }
}

async function sendToGarage(garage, request, vehicle, copy) {
  const email =
    typeof garage?.email === 'string' ? garage.email.trim().toLowerCase() : ''
  const garageId = typeof garage?.id === 'string' ? garage.id : ''
  if (!garageId || !email || !email.includes('@')) return

  const rendered = renderCopy(copy, {
    'επωνυμία': garage.companyName || '',
    'αυτοκίνητο': [vehicle?.brand, vehicle?.model].filter(Boolean).join(' '),
    'κατηγορία': categoryLabel(request.category)
  }, `${APP_URL}/garage-dashboard/${encodeURIComponent(garageId)}/?tab=requests`)

  const emailId = randomUUID()
  const sentAt = new Date().toISOString()

  await writeLog({
    emailId,
    to: email,
    from: FROM_ADDRESS,
    templateName: TEMPLATE_NAME,
    subject: rendered.subject,
    triggerEvent: 'service_request_submitted',
    status: NOTIFICATIONS_ENABLED ? 'queued' : 'skipped',
    sentAt,
    garageId,
    requestId: request.id
  })

  if (!NOTIFICATIONS_ENABLED) {
    console.log(
      `[broadcast] NOTIFICATIONS_OFF — would send "${rendered.subject}" to ${email}`
    )
    return
  }

  try {
    const boundary = `----=_Part_${randomUUID().replace(/-/g, '')}`
    const headers = [
      `From: ${FROM_NAME} <${FROM_ADDRESS}>`,
      `To: ${email}`,
      `Subject: =?UTF-8?B?${Buffer.from(rendered.subject).toString('base64')}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      `X-Mailer: NextService`,
      // Custom header read by the SES event processor Lambda to correlate
      // lifecycle events (delivery/bounce/open/click) back to this row.
      `X-Nextservice-EmailId: ${emailId}`
    ]
    if (SES_CONFIG_SET) {
      // Routes this send through the Configuration Set, unlocking event
      // publishing + open/click tracking.
      headers.push(`X-SES-CONFIGURATION-SET: ${SES_CONFIG_SET}`)
    }
    const rawMessage = [
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
      `--${boundary}--`
    ].join('\r\n')

    const result = await ses.send(
      new SendRawEmailCommand({ RawMessage: { Data: Buffer.from(rawMessage) } })
    )
    await updateLog(emailId, { status: 'sent', sesMessageId: result.MessageId })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown SES error'
    console.error(`[broadcast] SES failed for ${email}:`, errorMessage)
    await updateLog(emailId, { status: 'failed', errorMessage })
  }
}

async function writeLog(record) {
  try {
    const item = {
      ...record,
      expiresAt: Math.floor(Date.now() / 1000) + EMAIL_LOG_TTL_SECONDS
    }
    await ddb.send(new PutCommand({ TableName: EMAIL_LOGS_TABLE, Item: item }))
  } catch (err) {
    console.error('[broadcast] Failed to write EmailLogs:', err)
  }
}

async function updateLog(emailId, patch) {
  try {
    const sets = []
    const values = {}
    const names = {}
    if (patch.status) {
      sets.push('#s = :s')
      values[':s'] = patch.status
      names['#s'] = 'status'
    }
    if (patch.sesMessageId) {
      sets.push('sesMessageId = :m')
      values[':m'] = patch.sesMessageId
    }
    if (patch.errorMessage) {
      sets.push('errorMessage = :e')
      values[':e'] = patch.errorMessage
    }
    if (sets.length === 0) return

    await ddb.send(
      new UpdateCommand({
        TableName: EMAIL_LOGS_TABLE,
        Key: { emailId },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
        ExpressionAttributeValues: values
      })
    )
  } catch (err) {
    console.error('[broadcast] Failed to update EmailLogs:', err)
  }
}

// ── Email copy ───────────────────────────────────────────────────────────
// A copy of the catalog entry in src/lib/email-templates/catalog.ts.
const DEFAULT_COPY = {
  subject: 'Νέο αίτημα για προσφορά στο NextService',
  heading: 'Νέο αίτημα διαθέσιμο',
  body:
    'Γεια σου {επωνυμία},\n\n' +
    'Ένας πελάτης μόλις ζήτησε προσφορά για **{κατηγορία}** στο **{αυτοκίνητο}**.\n\n' +
    'Δες την περιγραφή και τις φωτογραφίες στο dashboard και στείλε την προσφορά σου πριν από τα άλλα συνεργεία.',
  ctaLabel: 'Δες το αίτημα',
  note: ''
}

/** The admin's edited copy over the shipped one, field by field. Never throws. */
async function loadCopy() {
  try {
    const res = await ddb.send(new GetCommand({
      TableName: SITE_CONTENT_TABLE,
      Key: { pageKey: `email:${TEMPLATE_NAME}` }
    }))
    return mergeCopy(DEFAULT_COPY, res.Item)
  } catch (err) {
    console.error('[broadcast] email copy lookup failed, using the shipped copy:', err)
    return DEFAULT_COPY
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]))
}
