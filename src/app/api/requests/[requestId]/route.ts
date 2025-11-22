import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params

    if (!requestId) {
      return NextResponse.json({ 
        error: 'Request ID is required' 
      }, { status: 400 })
    }

    // Get service request details
    const scanCommand = new ScanCommand({
      TableName: 'ServiceRequests',
      FilterExpression: 'id = :requestId',
      ExpressionAttributeValues: {
        ':requestId': requestId
      }
    })

    const result = await dynamoDB.send(scanCommand)

    if (!result.Items || result.Items.length === 0) {
      return NextResponse.json({ 
        error: 'Service request not found' 
      }, { status: 404 })
    }

    const serviceRequest = result.Items[0]

    // Get client details
    const clientScanCommand = new ScanCommand({
      TableName: 'Clients',
      FilterExpression: 'id = :clientId',
      ExpressionAttributeValues: {
        ':clientId': serviceRequest.clientId
      }
    })

    const clientResult = await dynamoDB.send(clientScanCommand)
    const client = clientResult.Items?.[0]

    // Get vehicle details
    const vehicleScanCommand = new ScanCommand({
      TableName: 'Vehicles',
      FilterExpression: 'id = :vehicleId',
      ExpressionAttributeValues: {
        ':vehicleId': serviceRequest.vehicleId
      }
    })

    const vehicleResult = await dynamoDB.send(vehicleScanCommand)
    const vehicle = vehicleResult.Items?.[0]

    return NextResponse.json({
      success: true,
      request: {
        id: serviceRequest.id,
        description: serviceRequest.description,
        category: serviceRequest.category,
        status: serviceRequest.status,
        createdAt: serviceRequest.createdAt,
        clientAvailabilityDates: serviceRequest.clientAvailabilityDates || [],
        photoUrls: serviceRequest.photoUrls || [],
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
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function PATCH(
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

    // Fetch client details
    const clientScanCommand = new ScanCommand({
      TableName: 'Clients',
      FilterExpression: 'id = :clientId',
      ExpressionAttributeValues: {
        ':clientId': updatedRequest.clientId
      }
    })

    const clientResult = await dynamoDB.send(clientScanCommand)
    const client = clientResult.Items?.[0]

    // Fetch vehicle details
    const vehicleScanCommand = new ScanCommand({
      TableName: 'Vehicles',
      FilterExpression: 'id = :vehicleId',
      ExpressionAttributeValues: {
        ':vehicleId': updatedRequest.vehicleId
      }
    })

    const vehicleResult = await dynamoDB.send(vehicleScanCommand)
    const vehicle = vehicleResult.Items?.[0]

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
        photoUrls: updatedRequest.photoUrls || [],
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
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}


