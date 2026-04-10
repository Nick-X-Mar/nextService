import { randomUUID } from 'crypto'
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses'
import { fromIni } from '@aws-sdk/credential-provider-ini'
import path from 'path'
import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { ensureEmailLogsTable } from '@/utils/ensureEventTables'
import { renderEmail } from '@/lib/email-templates'
import type {
  EmailLogRecord,
  EmailStatus,
  EmailTemplateName,
  EventNameValue
} from '@/types/events'

const EMAIL_LOGS_TABLE = process.env.EMAIL_LOGS_TABLE || 'EmailLogs'
const FROM_ADDRESS = process.env.SES_FROM_ADDRESS || 'no-reply@nextservice.gr'
const FROM_NAME = 'NextService'
const SES_REGION = process.env.SES_REGION || process.env.REGION || 'eu-central-1'

// Retention: 180 days for the EmailLogs records — long enough to debug
// recent delivery issues, short enough not to hoard personal data.
const EMAIL_LOG_TTL_SECONDS = 180 * 24 * 60 * 60

/**
 * Master switch for all outbound notifications (email, SMS, push, etc.).
 * Default is OFF — set NOTIFICATIONS_ENABLED=true in .env to actually send.
 * This means local dev never sends real emails/SMS by accident.
 */
const notificationsEnabled =
  (process.env.NOTIFICATIONS_ENABLED ?? 'false').toLowerCase() === 'true'

let sesClient: SESClient | null = null
function getSesClient(): SESClient {
  if (sesClient) return sesClient

  const isProdOrStaging = ['production', 'staging'].includes(process.env.NODE_ENV || '')
  const config: ConstructorParameters<typeof SESClient>[0] = { region: SES_REGION }

  if (process.env.ACCESS_KEY_ID && process.env.SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.ACCESS_KEY_ID,
      secretAccessKey: process.env.SECRET_ACCESS_KEY
    }
  } else if (!isProdOrStaging) {
    try {
      config.credentials = fromIni({
        filepath: path.join(process.cwd(), '.aws', 'credentials'),
        configFilepath: path.join(process.cwd(), '.aws', 'config'),
        profile: 'default'
      })
    } catch {
      // Fall through — let the SDK try the default credential chain.
    }
  }

  sesClient = new SESClient(config)
  return sesClient
}

export interface SendEmailInput {
  to: string
  templateName: EmailTemplateName
  variables: Record<string, string>
  triggerEvent: EventNameValue
  clientId?: string
  garageId?: string
  requestId?: string
}

/**
 * Send an email and write a record to EmailLogs. Fire-and-forget from the
 * caller's perspective: never throws, errors are logged. The admin app
 * reads from EmailLogs to render its monitoring dashboard.
 */
export function sendEmail(input: SendEmailInput): void {
  // We deliberately don't await — the API route should respond instantly.
  void sendEmailInternal(input).catch((err) => {
    console.error('[emailService] Unhandled send error:', input.templateName, err)
  })
}

async function sendEmailInternal(input: SendEmailInput): Promise<void> {
  const { to, templateName, variables, triggerEvent, clientId, garageId, requestId } = input

  if (!to || !to.includes('@')) {
    console.warn('[emailService] Skipping send — invalid recipient:', to)
    return
  }

  const rendered = renderEmail(templateName, variables)
  const emailId = randomUUID()
  const sentAt = new Date().toISOString()

  // We deliberately DO NOT store the rendered subject/body in EmailLogs.
  // Templates are deterministic — the admin app can re-render from the
  // template name + ids if it ever needs the actual content. Keeping the
  // log row PII-free reduces blast radius if the table ever leaks.
  const baseRecord: EmailLogRecord = {
    emailId,
    to,
    from: FROM_ADDRESS,
    templateName,
    subject: rendered.subject,
    bodyPreview: '',
    triggerEvent,
    status: notificationsEnabled ? 'queued' : 'skipped',
    sentAt,
    ...(clientId ? { clientId } : {}),
    ...(garageId ? { garageId } : {}),
    ...(requestId ? { requestId } : {})
  }

  await writeEmailLog(baseRecord)

  if (!notificationsEnabled) {
    console.log(
      `[emailService] NOTIFICATIONS OFF — would send "${rendered.subject}" to ${to} (template=${templateName}, trigger=${triggerEvent})`
    )
    return
  }

  try {
    const boundary = `----=_Part_${randomUUID().replace(/-/g, '')}`

    const rawMessage = [
      `From: ${FROM_NAME} <${FROM_ADDRESS}>`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(rendered.subject).toString('base64')}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      `X-Mailer: NextService`,
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

    const command = new SendRawEmailCommand({
      RawMessage: { Data: Buffer.from(rawMessage) }
    })
    const result = await getSesClient().send(command)
    await updateEmailLog(emailId, {
      status: 'sent',
      sesMessageId: result.MessageId
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown SES error'
    console.error('[emailService] SES send failed:', templateName, errorMessage)
    await updateEmailLog(emailId, { status: 'failed', errorMessage })
  }
}

async function writeEmailLog(record: EmailLogRecord): Promise<void> {
  try {
    await ensureEmailLogsTable()
    const item: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(record)) {
      // Skip undefined AND skip the empty bodyPreview field — DynamoDB
      // doesn't accept empty strings on its own row attribute, and we
      // intentionally aren't storing body content anyway.
      if (v === undefined) continue
      if (k === 'bodyPreview' && v === '') continue
      item[k] = v
    }
    // Auto-cleanup after 180 days via DynamoDB TTL.
    item.expiresAt = Math.floor(Date.now() / 1000) + EMAIL_LOG_TTL_SECONDS
    await dynamoDB.send(new PutCommand({ TableName: EMAIL_LOGS_TABLE, Item: item }))
  } catch (err) {
    console.error('[emailService] Failed to write EmailLogs record:', err)
  }
}

async function updateEmailLog(
  emailId: string,
  patch: { status?: EmailStatus; sesMessageId?: string; errorMessage?: string }
): Promise<void> {
  try {
    await ensureEmailLogsTable()
    const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb')
    const sets: string[] = []
    const values: Record<string, unknown> = {}
    if (patch.status) {
      sets.push('#s = :s')
      values[':s'] = patch.status
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

    await dynamoDB.send(
      new UpdateCommand({
        TableName: EMAIL_LOGS_TABLE,
        Key: { emailId },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: patch.status ? { '#s': 'status' } : undefined,
        ExpressionAttributeValues: values
      })
    )
  } catch (err) {
    console.error('[emailService] Failed to update EmailLogs record:', err)
  }
}

export function isNotificationsEnabled(): boolean {
  return notificationsEnabled
}
