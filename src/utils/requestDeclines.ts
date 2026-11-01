import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { collectAll } from '@/utils/pagination'
import { ensureRequestDeclinesTable } from '@/utils/ensureLedgerTables'
import { TABLES } from '@/lib/tables'

export interface RequestDecline {
  declineId: string
  requestId: string
  garageId: string
  reason: string
  reasonText?: string
  createdAt: string
}

/** One row per garage per request: the key itself refuses a second. */
export function declineIdFor(requestId: string, garageId: string): string {
  return `${requestId}#${garageId}`
}

/**
 * Every request this garage has said it cannot take, newest first. Drained in
 * full for the same reason the garage's offers are: these leave the feed, and
 * a partial list would bring declined requests back into it.
 */
export async function garageDeclines(garageId: string): Promise<RequestDecline[]> {
  await ensureRequestDeclinesTable()
  const rows = await collectAll<Record<string, unknown>>(
    (startKey) =>
      dynamoDB.send(new QueryCommand({
        TableName: TABLES.RequestDeclines,
        IndexName: 'GarageDeclinesIndex',
        KeyConditionExpression: 'garageId = :garageId',
        ExpressionAttributeValues: { ':garageId': garageId },
        ScanIndexForward: false,
        ExclusiveStartKey: startKey,
      })),
    `declines for ${garageId}`
  )
  return rows as unknown as RequestDecline[]
}
