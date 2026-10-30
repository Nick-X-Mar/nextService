import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { batchGetById } from '@/utils/batchGetById'
import { createTtlCache } from '@/utils/ttlCache'
import { TABLES } from '@/lib/tables'
import { RECENCY_YEARS, canonFuel, isPlausiblePrice, toExample, type Example } from '@/lib/price-lookup'

/**
 * Every offer a garage has sent through the platform, as a past job for the price lookup.
 *
 * An offer is a real quote for a fully described car — category, make, model, year,
 * fuel, cc, turbo, 4x4 — so it needs none of the guesswork the spreadsheets do, and it
 * is net of VAT like the rest of the dataset. All offers count, not only accepted ones:
 * a quote the client turned down is still a price a garage named for that car. Each
 * request is matched against the car as it is stored now; an anonymized vehicle has no
 * model year left and so never matches.
 *
 * Rebuilt at most every 10 minutes per server instance, and on the instance that wrote
 * an offer right away (`invalidatePlatformExamples`). It reads the whole Offers table,
 * which is fine at the platform's size; if it ever is not, keep a running table instead.
 */
const cache = createTtlCache<Example[]>(10 * 60_000)

/**
 * Called after an offer is written, so the next estimate on this instance already
 * counts it. Other server instances catch up within the 10 minutes.
 */
export function invalidatePlatformExamples(): void {
  cache.invalidate('all')
}

export async function platformExamples(): Promise<Example[]> {
  try {
    return await cache.getOrCompute('all', load)
  } catch (err) {
    // The spreadsheets alone still answer; a failed read is retried on the next call.
    console.error('[price-estimation] could not load platform offers:', err)
    return []
  }
}

async function load(): Promise<Example[]> {
  const since = new Date()
  since.setFullYear(since.getFullYear() - RECENCY_YEARS)

  const offers: Record<string, unknown>[] = []
  let lastKey: Record<string, unknown> | undefined
  do {
    const res = await dynamoDB.send(new ScanCommand({
      TableName: TABLES.Offers,
      ProjectionExpression: 'serviceRequestId, offerAmount, createdAt',
      FilterExpression: 'createdAt >= :since',
      ExpressionAttributeValues: { ':since': since.toISOString() },
      ExclusiveStartKey: lastKey,
    }))
    offers.push(...(res.Items ?? []))
    lastKey = res.LastEvaluatedKey
  } while (lastKey)

  const requests = await batchGetById(TABLES.ServiceRequests, offers.map((o) => o.serviceRequestId as string), {
    projection: 'id, category, vehicleId',
  })
  const vehicles = await batchGetById(TABLES.Vehicles, [...requests.values()].map((r) => r.vehicleId as string), {
    projection: 'id, brand, model, modelYear, engineCC, fuelType, is4x4, isTurbo',
  })

  const examples: Example[] = []
  for (const offer of offers) {
    const request = requests.get(offer.serviceRequestId as string)
    const vehicle = request && vehicles.get(request.vehicleId as string)
    if (!request || !vehicle || !vehicle.brand) continue

    const category = String(request.category)
    const price = Number(offer.offerAmount)
    if (!isPlausiblePrice(category, price)) continue

    examples.push(toExample({
      category,
      brand: String(vehicle.brand),
      model: vehicle.model ? String(vehicle.model) : '',
      year: toInt(vehicle.modelYear),
      cc: toInt(vehicle.engineCC),
      fuel: canonFuel(vehicle.fuelType as string | undefined),
      is4x4: vehicle.is4x4 === true,
      isTurbo: vehicle.isTurbo === true,
      price: Math.round(price),
    }))
  }
  return examples
}

function toInt(value: unknown): number | null {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10)
  return Number.isFinite(n) ? n : null
}
