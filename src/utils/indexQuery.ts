import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'

/**
 * Query a GSI, falling back to an equivalent filtered scan when that index is
 * not on the table.
 *
 * Two things make this necessary. Infrastructure and application deploy on
 * separate cadences, so a newly declared index does not exist until the CDK
 * stack is deployed. And the local DynamoDB tables are not created from the CDK
 * at all, so they drift — `Garages` locally has `PhoneIndex` where the stack
 * declares `TINIndex`. Without this, swapping a scan for an index query turns a
 * working endpoint into a 500 on whichever environment is behind.
 *
 * The fallback is a bridge, not a design: it reads the whole table, which is
 * exactly what the index exists to avoid. Anything relying on it should be
 * followed by a deploy.
 */
export async function queryIndexOrScan<T>(args: {
  table: string
  indexName: string
  /** Key condition for the index path, e.g. `tin = :tin`. */
  keyConditionExpression: string
  /** Equivalent filter for the scan path, e.g. `tin = :tin`. */
  scanFilterExpression: string
  expressionAttributeValues: Record<string, unknown>
  expressionAttributeNames?: Record<string, string>
  limit?: number
}): Promise<T[]> {
  const {
    table,
    indexName,
    keyConditionExpression,
    scanFilterExpression,
    expressionAttributeValues,
    expressionAttributeNames,
    limit,
  } = args

  try {
    const res = await dynamoDB.send(new QueryCommand({
      TableName: table,
      IndexName: indexName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ...(expressionAttributeNames ? { ExpressionAttributeNames: expressionAttributeNames } : {}),
      ...(limit ? { Limit: limit } : {}),
    }))
    return (res.Items ?? []) as T[]
  } catch (error) {
    const name = (error as { name?: string })?.name
    // Anything other than "that index isn't there" is a real failure.
    if (name !== 'ValidationException' && name !== 'ResourceNotFoundException') throw error
    console.warn(`[indexQuery] ${table}.${indexName} missing — falling back to scan`)
    const res = await dynamoDB.send(new ScanCommand({
      TableName: table,
      FilterExpression: scanFilterExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ...(expressionAttributeNames ? { ExpressionAttributeNames: expressionAttributeNames } : {}),
    }))
    return (res.Items ?? []) as T[]
  }
}
