import { randomUUID } from 'crypto'
import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { ensureEventLogsTable } from '@/utils/ensureEventTables'
import type { EventLogRecord, LogEventInput } from '@/types/events'

const EVENT_LOGS_TABLE = process.env.EVENT_LOGS_TABLE || 'EventLogs'

/**
 * Fire-and-forget event logger. Writes a single record to the EventLogs
 * DynamoDB table. NEVER throws — failures are swallowed and logged so the
 * caller's main flow is never affected.
 *
 * Usage from API routes:
 *
 *   logEvent({
 *     eventName: EventName.ServiceRequestSubmitted,
 *     actorType: 'client',
 *     actorId: clientId,
 *     clientId,
 *     requestId: serviceRequestId,
 *     metadata: { category: body.category }
 *   })
 *
 * Notice: no `await`. The DB write happens in the background; the route
 * responds immediately.
 */
export function logEvent(input: LogEventInput): void {
  const record: EventLogRecord = {
    ...input,
    eventId: randomUUID(),
    timestamp: new Date().toISOString()
  }

  // Strip undefined values — DynamoDB doesn't accept them.
  const item: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) item[key] = value
  }

  ensureEventLogsTable()
    .then(() =>
      dynamoDB.send(new PutCommand({ TableName: EVENT_LOGS_TABLE, Item: item }))
    )
    .catch((err) => {
      console.error('[eventLogger] Failed to write event:', input.eventName, err)
    })
}
