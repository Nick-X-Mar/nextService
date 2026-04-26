import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { generatePresignedUrls } from '@/utils/s3Service'
import { withMetrics } from '@/utils/withMetrics'

async function _GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params

    // Fetch service request
    const reqResult = await dynamoDB.send(new GetCommand({
      TableName: 'ServiceRequests',
      Key: { id: requestId }
    }))

    const sr = reqResult.Item
    if (!sr) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    // Fetch client, vehicle, and offers in parallel
    const [clientResult, vehicleResult, offersResult] = await Promise.all([
      sr.clientId
        ? dynamoDB.send(new GetCommand({
            TableName: 'Clients',
            Key: { id: sr.clientId }
          }))
        : Promise.resolve({ Item: undefined }),
      sr.vehicleId
        ? dynamoDB.send(new GetCommand({
            TableName: 'Vehicles',
            Key: { id: sr.vehicleId }
          }))
        : Promise.resolve({ Item: undefined }),
      dynamoDB.send(new QueryCommand({
        TableName: 'Offers',
        IndexName: 'ServiceRequestOffersIndex',
        KeyConditionExpression: 'serviceRequestId = :reqId',
        ExpressionAttributeValues: { ':reqId': requestId }
      }))
    ])

    const client = clientResult.Item
    const vehicle = vehicleResult.Item
    const offers = offersResult.Items || []

    // If there are offers, batch-fetch garage names
    const garageIds = [...new Set(offers.map((o) => o.garageId).filter(Boolean))]
    const garageMap: Record<string, string> = {}

    if (garageIds.length > 0) {
      const garageResults = await Promise.all(
        garageIds.map((gId) =>
          dynamoDB.send(new GetCommand({
            TableName: 'Garages',
            Key: { id: gId },
            ProjectionExpression: 'id, companyName'
          })).then((res) => res.Item)
        )
      )
      for (const g of garageResults) {
        if (g) garageMap[g.id] = g.companyName || g.id
      }
    }

    // Generate presigned URLs for photos
    const rawPhotoUrls = sr.photoUrls || []
    const photoUrls = rawPhotoUrls.length > 0
      ? await generatePresignedUrls(rawPhotoUrls)
      : []

    return NextResponse.json({
      id: sr.id,
      description: sr.description,
      category: sr.serviceCategory || sr.category || '-',
      status: sr.status,
      createdAt: sr.createdAt,
      updatedAt: sr.updatedAt,
      estimatedCost: sr.estimatedCost,
      clientAvailabilityDates: sr.clientAvailabilityDates || [],
      acceptedOfferId: sr.acceptedOfferId,
      appointmentDate: sr.appointmentDate,
      appointmentPrice: sr.appointmentPrice,
      cancelledAt: sr.cancelledAt,
      photoUrls,
      client: client
        ? {
            id: client.id,
            firstName: client.firstName,
            lastName: client.lastName,
            email: client.email,
            phoneNumber: client.phoneNumber
          }
        : null,
      vehicle: vehicle
        ? {
            brand: vehicle.brand,
            model: vehicle.model,
            year: vehicle.year,
            licensePlate: vehicle.licensePlate,
            engineCC: vehicle.engineCC,
            fuelType: vehicle.fuelType,
            is4x4: vehicle.is4x4,
            isAutomatic: vehicle.isAutomatic,
            isTurbo: vehicle.isTurbo
          }
        : null,
      offers: offers.map((o) => ({
        id: o.id,
        garageId: o.garageId,
        garageName: garageMap[o.garageId] || o.garageId,
        price: o.price,
        message: o.message,
        status: o.status,
        createdAt: o.createdAt
      }))
    })
  } catch (error) {
    console.error('Admin request detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch request' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
