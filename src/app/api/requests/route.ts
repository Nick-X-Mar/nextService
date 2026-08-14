import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { decodeCursor, encodeCursor, parseLimit } from '@/utils/pagination'
import { requireClient } from '@/utils/requireAuth'
import { generatePresignedUrls } from '@/utils/s3Service'
import { withMetrics } from '@/utils/withMetrics'

async function _GET(request: NextRequest) {
  try {
    const clientId = requireClient(request)
    if (clientId instanceof NextResponse) return clientId

    // Query service requests by clientId using the ClientRequestsIndex.
    // Paginated: this read was previously unbounded, so a client with enough
    // history would silently stop seeing their oldest requests once the result
    // crossed DynamoDB's 1MB page limit.
    const { searchParams } = new URL(request.url)
    const queryCommand = new QueryCommand({
      TableName: 'ServiceRequests',
      IndexName: 'ClientRequestsIndex',
      KeyConditionExpression: 'clientId = :clientId',
      ExpressionAttributeValues: {
        ':clientId': clientId
      },
      ScanIndexForward: false, // Sort by createdAt descending (latest first)
      Limit: parseLimit(searchParams.get('limit'), 20),
      ExclusiveStartKey: decodeCursor(searchParams.get('cursor')),
    })

    const result = await dynamoDB.send(queryCommand)
    
    if (!result.Items) {
      return NextResponse.json({
        success: true,
        requests: [],
        nextCursor: null
      })
    }

    // For each service request, get the vehicle information
    const requestsWithVehicles = await Promise.all(
      result.Items.map(async (request) => {
        try {
          // Get vehicle information
          const vehicleQuery = new QueryCommand({
            TableName: 'Vehicles',
            KeyConditionExpression: 'id = :vehicleId',
            ExpressionAttributeValues: {
              ':vehicleId': request.vehicleId
            }
          })

          const vehicleResult = await dynamoDB.send(vehicleQuery)
          const vehicle = vehicleResult.Items?.[0]

          const vehicleData = vehicle
            ? {
                brand: vehicle.brand,
                model: vehicle.model,
                modelYear: vehicle.modelYear,
                engineCC: vehicle.engineCC,
                fuelType: vehicle.fuelType,
                isAutomatic: vehicle.isAutomatic,
                is4x4: vehicle.is4x4,
                isTurbo: vehicle.isTurbo,
                licensePlate: vehicle.licensePlate,
                engineNumber: vehicle.engineNumber,
                vinNumber: vehicle.vinNumber,
                color: vehicle.color,
                nickname: vehicle.nickname
              }
            : null

          // Generate presigned URLs for photos
          const rawUrls = request.photoUrls || []
          const presignedPhotoUrls = rawUrls.length > 0
            ? await generatePresignedUrls(rawUrls)
            : []

          return {
            ...request,
            photoUrls: presignedPhotoUrls,
            clientAvailabilityDates: request.clientAvailabilityDates || [],
            vehicle: vehicleData
          }
        } catch (error) {
          console.error('Error fetching vehicle for request:', request.id, error)
          return {
            ...request,
            clientAvailabilityDates: request.clientAvailabilityDates || [],
            vehicle: null
          }
        }
      })
    )

    // `include=summary` folds in the two things the requests page used to fetch
    // per row: whether any garage has written, and the offers on the request.
    //
    // Doing it here turns 1 + R + R + (R x offers) browser round trips into one.
    // The nested loop was the worst of it: the page fetched every offer, then
    // fetched that offer's garage individually — the same garage re-fetched once
    // per offer. Here the garages are deduped and read once.
    if (searchParams.get('include') === 'summary') {
      const requestIds = requestsWithVehicles
        .map((r) => (r as { id?: string }).id)
        .filter((id): id is string => !!id)

      const [messageFlags, offersPerRequest] = await Promise.all([
        Promise.all(requestIds.map(async (requestId) => {
          const messages = await dynamoDB.send(new QueryCommand({
            TableName: 'ChatMessages',
            IndexName: 'RequestMessagesIndex',
            KeyConditionExpression: 'requestId = :requestId',
            FilterExpression: 'senderType = :garage',
            ExpressionAttributeValues: { ':requestId': requestId, ':garage': 'garage' },
            ProjectionExpression: 'requestId',
            Limit: 1,
          }))
          return [requestId, (messages.Items?.length ?? 0) > 0] as const
        })),
        Promise.all(requestIds.map(async (requestId) => {
          const offers = await dynamoDB.send(new QueryCommand({
            TableName: 'Offers',
            IndexName: 'ServiceRequestOffersIndex',
            KeyConditionExpression: 'serviceRequestId = :requestId',
            ExpressionAttributeValues: { ':requestId': requestId },
          }))
          return [requestId, offers.Items ?? []] as const
        })),
      ])

      const garageIds = [...new Set(
        offersPerRequest.flatMap(([, offers]) => offers.map((o) => o.garageId as string)).filter(Boolean)
      )]
      const garageRows = await Promise.all(
        garageIds.map((id) => dynamoDB.send(new GetCommand({ TableName: 'Garages', Key: { id } })))
      )
      const garageById = new Map(
        garageRows
          .map((g) => g.Item)
          .filter((g): g is Record<string, unknown> => !!g)
          .map((g) => [g.id as string, g])
      )

      return NextResponse.json({
        success: true,
        requests: requestsWithVehicles,
        garageMessages: Object.fromEntries(messageFlags),
        offers: Object.fromEntries(
          offersPerRequest.map(([requestId, offers]) => [
            requestId,
            offers.map((offer) => {
              const garage = garageById.get(offer.garageId as string)
              return {
                ...offer,
                garage: garage
                  ? {
                      companyName: garage.companyName,
                      address: garage.address,
                      benefits: Array.isArray(garage.benefits) ? garage.benefits : [],
                    }
                  : null,
              }
            }),
          ])
        ),
        nextCursor: encodeCursor(result.LastEvaluatedKey)
      })
    }

    return NextResponse.json({
      success: true,
      requests: requestsWithVehicles,
      nextCursor: encodeCursor(result.LastEvaluatedKey)
    })

  } catch (error) {
    console.error('Error fetching requests:', error)
    return NextResponse.json(
      { 
        error: 'Σφάλμα κατά την ανάκτηση των αιτημάτων',
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

export const GET = withMetrics(_GET)
