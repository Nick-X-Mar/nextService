import { NextRequest, NextResponse } from 'next/server'
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { batchGetById } from '@/utils/batchGetById'
import { collectAll } from '@/utils/pagination'
import { requireActiveGarage } from '@/utils/requireAuth'
import { withMetrics } from '@/utils/withMetrics'
import { TABLES } from '@/lib/tables'

const sameText = (a: unknown, b: unknown) =>
  typeof a === 'string' && typeof b === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * GET /api/garage/offer-suggestion?requestId=… — what this garage last quoted
 * for the same job on the same car (category, make and model), to start a new
 * offer from instead of an empty field. Only the garage's own offers are read,
 * so nothing of a competitor's price can surface here. `suggestion: null` when
 * it has never quoted that car for that job.
 */
async function _GET(request: NextRequest) {
  try {
    const garageId = await requireActiveGarage(request)
    if (garageId instanceof NextResponse) return garageId

    const requestId = request.nextUrl.searchParams.get('requestId')
    if (!requestId) return NextResponse.json({ error: 'requestId is required' }, { status: 400 })

    const target = (await dynamoDB.send(new GetCommand({
      TableName: TABLES.ServiceRequests,
      Key: { id: requestId },
      ProjectionExpression: 'id, category, vehicleId',
    }))).Item
    if (!target?.category || !target.vehicleId) return NextResponse.json({ success: true, suggestion: null })

    const [targetVehicle, offers] = await Promise.all([
      dynamoDB.send(new GetCommand({
        TableName: TABLES.Vehicles,
        Key: { id: target.vehicleId },
        ProjectionExpression: 'brand, #model',
        ExpressionAttributeNames: { '#model': 'model' },
      })).then((r) => r.Item),
      collectAll<Record<string, unknown>>(
        (startKey) => dynamoDB.send(new QueryCommand({
          TableName: TABLES.Offers,
          IndexName: 'GarageOffersIndex',
          KeyConditionExpression: 'garageId = :garageId',
          ExpressionAttributeValues: { ':garageId': garageId },
          ProjectionExpression: 'id, serviceRequestId, offerAmount, createdAt',
          ExclusiveStartKey: startKey,
        })),
        `offers of ${garageId}`
      ),
    ])
    if (!targetVehicle?.brand || !targetVehicle.model) return NextResponse.json({ success: true, suggestion: null })

    const others = offers.filter((o) => o.serviceRequestId !== requestId && typeof o.offerAmount === 'number')
    if (others.length === 0) return NextResponse.json({ success: true, suggestion: null })

    const requests = await batchGetById(TABLES.ServiceRequests, others.map((o) => o.serviceRequestId as string), {
      projection: 'id, category, vehicleId',
    })
    const sameJob = others.filter((o) => requests.get(o.serviceRequestId as string)?.category === target.category)
    if (sameJob.length === 0) return NextResponse.json({ success: true, suggestion: null })

    const vehicles = await batchGetById(
      TABLES.Vehicles,
      sameJob.map((o) => requests.get(o.serviceRequestId as string)?.vehicleId as string | undefined),
      { projection: 'id, brand, #model', names: { '#model': 'model' } }
    )
    const match = sameJob
      .filter((o) => {
        const vehicle = vehicles.get(requests.get(o.serviceRequestId as string)?.vehicleId as string)
        return sameText(vehicle?.brand, targetVehicle.brand) && sameText(vehicle?.model, targetVehicle.model)
      })
      .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))[0]

    return NextResponse.json({
      success: true,
      suggestion: match ? { amount: match.offerAmount, quotedAt: match.createdAt ?? null } : null,
    })
  } catch (error) {
    console.error('Error building offer suggestion:', error)
    return NextResponse.json({ error: 'Failed to build offer suggestion' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
