import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import { requireAuth, requireOwner } from '@/utils/requireAuth'
import { generatePresignedUrls } from '@/utils/s3Service'
import { withMetrics } from '@/utils/withMetrics'

async function _GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { requestId } = await params
    const { searchParams } = new URL(request.url)
    // Optional query param: when a garage is the viewer, the UI passes
    // ?viewerGarageId=... so we can audit the access. The route still
    // works without it for client-side viewers.
    const viewerGarageId = searchParams.get('viewerGarageId') || undefined

    if (!requestId) {
      return NextResponse.json({
        error: 'Request ID is required'
      }, { status: 400 })
    }

    // Get service request details
    const result = await dynamoDB.send(new GetCommand({
      TableName: 'ServiceRequests',
      Key: { id: requestId }
    }))

    if (!result.Item) {
      return NextResponse.json({
        error: 'Service request not found'
      }, { status: 404 })
    }

    const serviceRequest = result.Item

    // Authorization: clients can only view their own requests
    if (auth.userType === 'client' && auth.userId !== serviceRequest.clientId) {
      return NextResponse.json(
        { error: 'Δεν έχετε πρόσβαση σε αυτόν τον πόρο' },
        { status: 403 }
      )
    }

    // Authorization: if garage passes viewerGarageId, it must match authenticated user
    if (viewerGarageId && auth.userType === 'garage' && viewerGarageId !== auth.userId) {
      return NextResponse.json(
        { error: 'Δεν έχετε πρόσβαση σε αυτόν τον πόρο' },
        { status: 403 }
      )
    }

    // Fetch client + vehicle + presigned photo URLs in parallel — they're independent.
    const rawPhotoUrls = serviceRequest.photoUrls || []
    const [clientResult, vehicleResult, presignedPhotoUrls] = await Promise.all([
      dynamoDB.send(new GetCommand({
        TableName: 'Clients',
        Key: { id: serviceRequest.clientId }
      })),
      dynamoDB.send(new GetCommand({
        TableName: 'Vehicles',
        Key: { id: serviceRequest.vehicleId }
      })),
      rawPhotoUrls.length > 0 ? generatePresignedUrls(rawPhotoUrls) : Promise.resolve([])
    ])
    const client = clientResult.Item
    const vehicle = vehicleResult.Item

    // GDPR audit log: when a garage views a request that contains client
    // PII (name, phone) and vehicle PII (plate, VIN), record the access.
    // This lets us answer "who saw my data?" and detect scraping behavior.
    if (viewerGarageId) {
      logEvent({
        eventName: EventName.GarageViewedRequestDetails,
        actorType: 'garage',
        actorId: viewerGarageId,
        garageId: viewerGarageId,
        clientId: serviceRequest.clientId,
        requestId,
        source: 'api/requests/[requestId]',
        metadata: {
          fieldsExposed: [
            'client.firstName',
            'client.lastName',
            'client.phoneNumber',
            'vehicle.licensePlate',
            'vehicle.vinNumber',
            'vehicle.engineNumber'
          ]
        }
      })
    }

    return NextResponse.json({
      success: true,
      request: {
        id: serviceRequest.id,
        description: serviceRequest.description,
        category: serviceRequest.category,
        status: serviceRequest.status,
        createdAt: serviceRequest.createdAt,
        clientAvailabilityDates: serviceRequest.clientAvailabilityDates || [],
        photoUrls: presignedPhotoUrls,
        acceptedOfferId: serviceRequest.acceptedOfferId,
        appointmentDate: serviceRequest.appointmentDate,
        appointmentPrice: serviceRequest.appointmentPrice,
        client: client
          ? {
              firstName: client.firstName,
              lastName: client.lastName,
              phoneNumber: client.phoneNumber
            }
          : null,
        vehicle: vehicle
          ? {
              brand: vehicle.brand,
              model: vehicle.model,
              year: vehicle.year,
              licensePlate: vehicle.licensePlate,
              modelYear: vehicle.modelYear,
              engineCC: vehicle.engineCC,
              engineNumber: vehicle.engineNumber,
              fuelType: vehicle.fuelType,
              vinNumber: vehicle.vinNumber,
              is4x4: vehicle.is4x4,
              isAutomatic: vehicle.isAutomatic,
              isTurbo: vehicle.isTurbo
            }
          : null
      }
    })

  } catch (error) {
    console.error('Error fetching service request:', error)
    return NextResponse.json(
      { 
        error: 'Error fetching service request',
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

async function _PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params

    if (!requestId) {
      return NextResponse.json(
        { error: 'Request ID is required' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { clientAvailabilityDates } = body

    if (!Array.isArray(clientAvailabilityDates)) {
      return NextResponse.json(
        { error: 'clientAvailabilityDates must be an array of strings' },
        { status: 400 }
      )
    }

    if (clientAvailabilityDates.length > 5) {
      return NextResponse.json(
        { error: 'Μπορείτε να προτείνετε έως 5 ημερομηνίες' },
        { status: 400 }
      )
    }

    // Fetch the request to verify ownership
    const fetchResult = await dynamoDB.send(new GetCommand({
      TableName: 'ServiceRequests',
      Key: { id: requestId }
    }))
    const serviceRequest = fetchResult.Item

    if (!serviceRequest) {
      return NextResponse.json(
        { error: 'Service request not found' },
        { status: 404 }
      )
    }

    const ownerCheck = requireOwner(request, serviceRequest.clientId)
    if (ownerCheck instanceof NextResponse) return ownerCheck

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    const normalizedDates = Array.from(
      new Set(
        clientAvailabilityDates
          .map((date) => (typeof date === 'string' ? date.trim() : ''))
          .filter((date) => date.length > 0)
      )
    ).sort()

    if (normalizedDates.length === 0 && clientAvailabilityDates.length > 0) {
      return NextResponse.json(
        { error: 'Οι ημερομηνίες δεν είναι έγκυρες.' },
        { status: 400 }
      )
    }

    for (const date of normalizedDates) {
      if (!dateRegex.test(date)) {
        return NextResponse.json(
          { error: 'Οι ημερομηνίες πρέπει να είναι σε μορφή YYYY-MM-DD' },
          { status: 400 }
        )
      }

      const parsedDate = new Date(`${date}T00:00:00`)
      if (Number.isNaN(parsedDate.getTime())) {
        return NextResponse.json(
          { error: `Μη έγκυρη ημερομηνία: ${date}` },
          { status: 400 }
        )
      }
    }

    const updateCommand = new UpdateCommand({
      TableName: 'ServiceRequests',
      Key: { id: requestId },
      UpdateExpression: 'SET clientAvailabilityDates = :dates, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':dates': normalizedDates,
        ':updatedAt': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    })

    const updateResult = await dynamoDB.send(updateCommand)

    if (!updateResult.Attributes) {
      return NextResponse.json(
        { error: 'Service request not found' },
        { status: 404 }
      )
    }

    const updatedRequest = updateResult.Attributes

    logEvent({
      eventName: EventName.ClientAvailabilityDatesSubmitted,
      actorType: 'client',
      actorId: updatedRequest.clientId,
      clientId: updatedRequest.clientId,
      requestId,
      source: 'api/requests/[requestId]',
      metadata: { dateCount: normalizedDates.length }
    })

    // Fetch client + vehicle + presigned photo URLs in parallel.
    const rawPatchPhotoUrls = updatedRequest.photoUrls || []
    const [clientResult, vehicleResult, presignedPatchPhotoUrls] = await Promise.all([
      dynamoDB.send(new GetCommand({
        TableName: 'Clients',
        Key: { id: updatedRequest.clientId }
      })),
      dynamoDB.send(new GetCommand({
        TableName: 'Vehicles',
        Key: { id: updatedRequest.vehicleId }
      })),
      rawPatchPhotoUrls.length > 0 ? generatePresignedUrls(rawPatchPhotoUrls) : Promise.resolve([])
    ])
    const client = clientResult.Item
    const vehicle = vehicleResult.Item

    return NextResponse.json({
      success: true,
      request: {
        id: updatedRequest.id,
        description: updatedRequest.description,
        category: updatedRequest.category,
        status: updatedRequest.status,
        createdAt: updatedRequest.createdAt,
        updatedAt: updatedRequest.updatedAt,
        clientAvailabilityDates: updatedRequest.clientAvailabilityDates || [],
        photoUrls: presignedPatchPhotoUrls,
        client: client ? {
          firstName: client.firstName,
          lastName: client.lastName,
          phoneNumber: client.phoneNumber
        } : null,
        vehicle: vehicle ? {
          brand: vehicle.brand,
          model: vehicle.model,
          year: vehicle.year,
          licensePlate: vehicle.licensePlate,
          modelYear: vehicle.modelYear,
          engineCC: vehicle.engineCC,
          engineNumber: vehicle.engineNumber,
          fuelType: vehicle.fuelType,
          vinNumber: vehicle.vinNumber,
          is4x4: vehicle.is4x4,
          isAutomatic: vehicle.isAutomatic,
          isTurbo: vehicle.isTurbo
        } : null
      }
    })

  } catch (error) {
    console.error('Error updating client availability dates:', error)
    return NextResponse.json(
      {
        error: 'Δεν ήταν δυνατή η ενημέρωση των προτεινόμενων ημερομηνιών',
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

export const GET = withMetrics(_GET)
export const PATCH = withMetrics(_PATCH)
