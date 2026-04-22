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
 * Keep the email HTML in sync with `src/lib/email-templates/baseLayout.ts` +
 * the `NewRequestForGarages` renderer. The Next.js side is kept for legacy
 * in-process sends; this Lambda is the production path.
 */

import { randomUUID } from 'node:crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
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
const EMAIL_LOGS_TABLE = process.env.EMAIL_LOGS_TABLE || 'EmailLogs'
// Name of the SES Configuration Set defined in notifications_stack.py.
// Empty string disables tagging (e.g. for local/ad-hoc testing).
const SES_CONFIG_SET = process.env.SES_CONFIG_SET || ''
const NOTIFICATIONS_ENABLED =
  (process.env.NOTIFICATIONS_ENABLED ?? 'false').toLowerCase() === 'true'
const SEND_CONCURRENCY = Number.parseInt(process.env.SEND_CONCURRENCY || '10', 10)
const EMAIL_LOG_TTL_SECONDS = 180 * 24 * 60 * 60

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }))
const ses = new SESClient({ region: REGION })

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

  const garages = []
  let ExclusiveStartKey
  do {
    const page = await ddb.send(new ScanCommand({
      TableName: GARAGES_TABLE,
      FilterExpression: 'isActive = :active',
      ExpressionAttributeValues: { ':active': true },
      ProjectionExpression: 'id, email, companyName',
      ExclusiveStartKey
    }))
    for (const g of page.Items || []) garages.push(g)
    ExclusiveStartKey = page.LastEvaluatedKey
  } while (ExclusiveStartKey)

  console.log(
    `[broadcast] request=${requestId} active_garages=${garages.length}`
  )

  for (let i = 0; i < garages.length; i += SEND_CONCURRENCY) {
    const slice = garages.slice(i, i + SEND_CONCURRENCY)
    await Promise.all(
      slice.map((g) =>
        sendToGarage(g, request).catch((err) => {
          console.error(`[broadcast] garage=${g?.id} failed:`, err)
        })
      )
    )
  }
}

async function sendToGarage(garage, request) {
  const email =
    typeof garage?.email === 'string' ? garage.email.trim().toLowerCase() : ''
  const garageId = typeof garage?.id === 'string' ? garage.id : ''
  if (!garageId || !email || !email.includes('@')) return

  const rendered = renderNewRequestEmail({
    companyName: garage.companyName || '',
    brand: request.brand || '',
    model: request.model || '',
    category: request.category || '',
    garageId
  })

  const emailId = randomUUID()
  const sentAt = new Date().toISOString()

  await writeLog({
    emailId,
    to: email,
    from: FROM_ADDRESS,
    templateName: 'new_request_for_garages',
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

function renderNewRequestEmail(v) {
  const subject = 'Νέο αίτημα service στην περιοχή σου'
  const vehicle = [v.brand, v.model].filter(Boolean).join(' ')
  const ctaUrl = `${APP_URL}/garage-dashboard/${encodeURIComponent(v.garageId)}?tab=requests`
  const bodyHtml = `
    <h2 style="margin:0 0 16px 0;font-size:20px;">Νέο αίτημα διαθέσιμο</h2>
    <p>${v.companyName ? `Γεια σου ${escapeHtml(v.companyName)}, ` : ''}ένας πελάτης μόλις δημοσίευσε νέο αίτημα service${vehicle ? ` για <strong>${escapeHtml(vehicle)}</strong>` : ''}${v.category ? ` (${escapeHtml(v.category)})` : ''}.</p>
    <p>Μπες στο dashboard για να δεις τις λεπτομέρειες και να στείλεις προσφορά πριν σε προλάβει άλλο συνεργείο.</p>
  `
  const html = baseLayout({
    title: subject,
    bodyHtml,
    ctaLabel: 'Δες το αίτημα',
    ctaUrl
  })
  return { subject, html, text: htmlToPlainText(html) }
}

function baseLayout({ title, bodyHtml, ctaLabel, ctaUrl }) {
  const cta = ctaLabel && ctaUrl
    ? `<p style="margin:32px 0 0 0;text-align:center;">
         <a href="${ctaUrl}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-family:Arial,sans-serif;font-size:16px;">${ctaLabel}</a>
       </p>`
    : ''

  return `<!DOCTYPE html>
<html lang="el">
<head><meta charset="UTF-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:#f97316;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-family:Arial,sans-serif;">NextService</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;font-size:15px;line-height:1.6;color:#1f2937;">
              ${bodyHtml}
              ${cta}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#fafafa;font-size:12px;color:#6b7280;text-align:center;">
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

function htmlToPlainText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
