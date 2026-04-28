/**
 * NextService — SES Event Processor
 *
 * Subscribed to the SNS topic that the SES Configuration Set event destination
 * publishes to. For every lifecycle event (Send / Delivery / Bounce / Complaint
 * / Open / Click / Reject / RenderingFailure / DeliveryDelay), we:
 *
 *   1. Extract the `X-Nextservice-EmailId` custom MIME header that the sender
 *      injected (see emailService.ts and new-request-broadcast/index.mjs).
 *   2. Use that emailId as the EmailLogs PK for a cheap UpdateItem — no GSI
 *      lookup needed, no scan.
 *   3. Overwrite the row's `status` + stamp the per-event timestamp
 *      (deliveredAt / openedAt / clickedAt / bouncedAt / complainedAt /
 *       rejectedAt). For open/click we also bump `openCount` / `clickCount`.
 *
 * Status precedence: we DON'T downgrade status (e.g. if the row is already
 * `bounced`, an open event doesn't clobber it). ConditionExpression guards
 * each write.
 *
 * Self-contained — uses only the AWS SDK v3 bundled with Node.js 20.
 */

import {
  DynamoDBClient,
  ConditionalCheckFailedException
} from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  UpdateCommand
} from '@aws-sdk/lib-dynamodb'

const REGION = process.env.AWS_REGION || 'eu-central-1'
const EMAIL_LOGS_TABLE = process.env.EMAIL_LOGS_TABLE || 'EmailLogs'

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }))

// Higher rank wins. If an incoming event has a lower rank than what's
// already on the row, status is NOT overwritten (but timestamps still are).
// This prevents e.g. an `open` event from downgrading a `bounced` row.
const STATUS_RANK = {
  queued: 0,
  skipped: 0,
  sent: 10,
  delivered: 20,
  opened: 30,
  clicked: 40,
  // Failure states outrank success states — if anything went wrong we want
  // to see it, even if a later open event leaks through.
  deliveryDelayed: 15,
  rejected: 50,
  bounced: 60,
  complained: 70,
  failed: 80
}

export const handler = async (event) => {
  const records = Array.isArray(event?.Records) ? event.Records : []
  for (const rec of records) {
    try {
      const sesEvent = parseSnsMessage(rec)
      if (!sesEvent) continue
      await applyEvent(sesEvent)
    } catch (err) {
      console.error('[ses-processor] Record failed:', err)
      // Swallow — one bad SNS message shouldn't retry the whole batch.
    }
  }
  return { statusCode: 200, processed: records.length }
}

function parseSnsMessage(record) {
  // SNS wraps the SES event in Sns.Message (stringified JSON).
  const body = record?.Sns?.Message
  if (!body) return null
  try {
    return JSON.parse(body)
  } catch (err) {
    console.error('[ses-processor] Failed to parse SNS message:', err)
    return null
  }
}

async function applyEvent(sesEvent) {
  // Normalize event type — SES uses camelCase `eventType` in event
  // destinations, `notificationType` in legacy bounce/complaint/delivery
  // notifications. Handle both.
  const type =
    (sesEvent.eventType || sesEvent.notificationType || '').toString()
  const mail = sesEvent.mail || {}
  const emailId = findCustomHeader(mail.headers, 'X-Nextservice-EmailId')

  if (!emailId) {
    // No tag → nothing to correlate. Happens for emails sent before this
    // pipeline existed or from outside our senders. Not an error.
    console.log('[ses-processor] No X-Nextservice-EmailId header; skipping', {
      messageId: mail.messageId,
      type
    })
    return
  }

  const sesMessageId = mail.messageId
  const now = new Date().toISOString()

  let newStatus = null
  const timestampFields = {}
  const increments = {}

  switch (type) {
    case 'Send':
    case 'send':
      newStatus = 'sent'
      timestampFields.sentAt = now
      break
    case 'Delivery':
    case 'delivery':
      newStatus = 'delivered'
      timestampFields.deliveredAt = now
      break
    case 'Open':
    case 'open':
      newStatus = 'opened'
      timestampFields.openedAt = now
      increments.openCount = 1
      break
    case 'Click':
    case 'click': {
      newStatus = 'clicked'
      timestampFields.clickedAt = now
      increments.clickCount = 1
      const link = sesEvent.click?.link
      if (link) timestampFields.lastClickedLink = link
      break
    }
    case 'Bounce':
    case 'bounce': {
      newStatus = 'bounced'
      timestampFields.bouncedAt = now
      const b = sesEvent.bounce || {}
      if (b.bounceType) timestampFields.bounceType = b.bounceType
      if (b.bounceSubType) timestampFields.bounceSubType = b.bounceSubType
      const rcpts = b.bouncedRecipients?.[0]
      if (rcpts?.diagnosticCode) {
        timestampFields.errorMessage = String(rcpts.diagnosticCode).slice(0, 512)
      }
      break
    }
    case 'Complaint':
    case 'complaint': {
      newStatus = 'complained'
      timestampFields.complainedAt = now
      const c = sesEvent.complaint || {}
      if (c.complaintFeedbackType) {
        timestampFields.complaintFeedbackType = c.complaintFeedbackType
      }
      break
    }
    case 'Reject':
    case 'reject':
      newStatus = 'rejected'
      timestampFields.rejectedAt = now
      if (sesEvent.reject?.reason) {
        timestampFields.errorMessage = String(sesEvent.reject.reason).slice(0, 512)
      }
      break
    case 'DeliveryDelay':
    case 'deliveryDelay':
      // Intentionally does NOT change status — delays are transient and
      // SES still retries. Stamp a timestamp so we can see it happened.
      timestampFields.deliveryDelayedAt = now
      break
    case 'RenderingFailure':
    case 'renderingFailure':
      newStatus = 'failed'
      timestampFields.errorMessage = String(
        sesEvent.failure?.errorMessage || 'Template rendering failure'
      ).slice(0, 512)
      break
    default:
      console.warn('[ses-processor] Unknown event type:', type)
      return
  }

  if (sesMessageId && !timestampFields.sesMessageId) {
    // Backfill the SES messageId in case the Send event beats the sender's
    // own updateLog call. UpdateItem is idempotent so this is safe.
    timestampFields.sesMessageId = sesMessageId
  }

  await writeUpdate({ emailId, newStatus, timestampFields, increments })
}

async function writeUpdate({ emailId, newStatus, timestampFields, increments }) {
  const sets = []
  const adds = []
  const names = {}
  const values = {}

  // Always overwrite timestamp fields — they're per-event, not monotonic.
  for (const [k, v] of Object.entries(timestampFields)) {
    const placeholder = `:${k}`
    const namePlaceholder = `#${k}`
    names[namePlaceholder] = k
    values[placeholder] = v
    sets.push(`${namePlaceholder} = ${placeholder}`)
  }

  // Conditional status update — only set if the incoming rank >= existing.
  // Using a condition expression means we take one round-trip instead of
  // reading the row first.
  let conditionExpression
  if (newStatus) {
    names['#st'] = 'status'
    values[':newStatus'] = newStatus
    values[':newRank'] = STATUS_RANK[newStatus] ?? 0
    sets.push('#st = :newStatus')
    // Allow the update if the row has no rank yet (attribute_not_exists)
    // or the existing rank is <= the new rank. We additionally store
    // `statusRank` so subsequent updates have something to compare against.
    names['#sr'] = 'statusRank'
    sets.push('#sr = :newRank')
    conditionExpression =
      'attribute_not_exists(#sr) OR #sr <= :newRank'
  }

  // ADD expressions for counters (atomic increments).
  for (const [k, delta] of Object.entries(increments)) {
    const namePlaceholder = `#${k}`
    const placeholder = `:${k}_delta`
    names[namePlaceholder] = k
    values[placeholder] = delta
    adds.push(`${namePlaceholder} ${placeholder}`)
  }

  const updateExpressionParts = []
  if (sets.length) updateExpressionParts.push(`SET ${sets.join(', ')}`)
  if (adds.length) updateExpressionParts.push(`ADD ${adds.join(', ')}`)
  const updateExpression = updateExpressionParts.join(' ')

  if (!updateExpression) return

  try {
    await ddb.send(new UpdateCommand({
      TableName: EMAIL_LOGS_TABLE,
      Key: { emailId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ConditionExpression: conditionExpression
    }))
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      // Status didn't outrank existing — still apply timestamps/counters
      // by dropping the conditional status update and retrying.
      if (!newStatus) throw err
      await applyWithoutStatus({ emailId, timestampFields, increments })
      return
    }
    throw err
  }
}

async function applyWithoutStatus({ emailId, timestampFields, increments }) {
  const sets = []
  const adds = []
  const names = {}
  const values = {}

  for (const [k, v] of Object.entries(timestampFields)) {
    const placeholder = `:${k}`
    const namePlaceholder = `#${k}`
    names[namePlaceholder] = k
    values[placeholder] = v
    sets.push(`${namePlaceholder} = ${placeholder}`)
  }
  for (const [k, delta] of Object.entries(increments)) {
    const namePlaceholder = `#${k}`
    const placeholder = `:${k}_delta`
    names[namePlaceholder] = k
    values[placeholder] = delta
    adds.push(`${namePlaceholder} ${placeholder}`)
  }

  const updateExpressionParts = []
  if (sets.length) updateExpressionParts.push(`SET ${sets.join(', ')}`)
  if (adds.length) updateExpressionParts.push(`ADD ${adds.join(', ')}`)
  const updateExpression = updateExpressionParts.join(' ')

  if (!updateExpression) return

  await ddb.send(new UpdateCommand({
    TableName: EMAIL_LOGS_TABLE,
    Key: { emailId },
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values
  }))
}

function findCustomHeader(headers, name) {
  if (!Array.isArray(headers)) return null
  const target = name.toLowerCase()
  for (const h of headers) {
    if (typeof h?.name === 'string' && h.name.toLowerCase() === target) {
      return typeof h.value === 'string' ? h.value : null
    }
  }
  return null
}
