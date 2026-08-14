import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand } from '@aws-sdk/lib-dynamodb'

/**
 * Point lookup by `id` that tolerates a missing key.
 *
 * `GetCommand` with `Key: { id: undefined }` does not return empty — it throws
 * ValidationException ("The number of conditions on the keys is invalid"). Every
 * one of these lookups sits inside a `Promise.all` over a list, so one row with
 * a missing `vehicleId` or `clientId` failed the entire response: a garage's
 * whole offers tab, or the available-requests feed for every garage, went 500.
 *
 * Returning undefined instead lets the caller render the parts it does have,
 * which is what it already does for a row that was deleted.
 */
export async function getByIdOrNull(
  table: string,
  id?: string | null
): Promise<Record<string, unknown> | undefined> {
  if (!id) return undefined
  const res = await dynamoDB.send(new GetCommand({ TableName: table, Key: { id } }))
  return res.Item
}
