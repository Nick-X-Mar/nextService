import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { createTtlCache } from '@/utils/ttlCache'
import { businessTypes, type BusinessType } from '@/types/businessTypes'
import { TABLES } from '@/lib/tables'

// Read on every feed page and summary poll; a profile change shows within the
// window on other instances, at once on the one that saved it.
const cache = createTtlCache<BusinessType[]>(30_000)

/** What the garage says it is (`Garages.businessTypes`) — [] when it has not said. */
export function garageBusinessTypes(garageId: string): Promise<BusinessType[]> {
  return cache.getOrCompute(garageId, async () => {
    const res = await dynamoDB.send(new GetCommand({
      TableName: TABLES.Garages,
      Key: { id: garageId },
      ProjectionExpression: 'businessTypes',
    }))
    return businessTypes(res.Item?.businessTypes)
  })
}

/** Call after writing `Garages.businessTypes`. */
export function invalidateGarageBusinessTypes(garageId: string): void {
  cache.invalidate(garageId)
}
