import { BatchGetCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'

const BATCH_SIZE = 100
const MAX_RETRIES = 5

/**
 * Point-reads many rows of an `id`-keyed table, keyed by id in the result.
 *
 * The notification summary runs on every poll of every open tab, and it used to
 * issue one GetItem per request the user had ever touched. BatchGet does the
 * same reads in round trips of 100. DynamoDB may hand back part of a batch as
 * `UnprocessedKeys` under load, so those are retried with backoff rather than
 * silently dropped — a dropped row here is a banner that vanishes.
 *
 * `projection` must include `id`; `names` maps any reserved words in it.
 */
export async function batchGetById(
  table: string,
  ids: (string | null | undefined)[],
  options: { projection?: string; names?: Record<string, string> } = {}
): Promise<Map<string, Record<string, unknown>>> {
  const unique = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))]
  const found = new Map<string, Record<string, unknown>>()

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    let keys: Record<string, unknown>[] = unique.slice(i, i + BATCH_SIZE).map((id) => ({ id }))
    for (let attempt = 0; keys.length > 0; attempt++) {
      if (attempt > 0) {
        if (attempt > MAX_RETRIES) {
          console.warn(`[batchGetById] ${table}: ${keys.length} keys still unprocessed after retries`)
          break
        }
        await new Promise((r) => setTimeout(r, 50 * 2 ** attempt))
      }
      const res = await dynamoDB.send(new BatchGetCommand({
        RequestItems: {
          [table]: {
            Keys: keys,
            ...(options.projection ? { ProjectionExpression: options.projection } : {}),
            ...(options.names ? { ExpressionAttributeNames: options.names } : {}),
          },
        },
      }))
      for (const item of res.Responses?.[table] ?? []) {
        if (typeof item.id === 'string') found.set(item.id, item)
      }
      keys = (res.UnprocessedKeys?.[table]?.Keys ?? []) as Record<string, unknown>[]
    }
  }

  return found
}
