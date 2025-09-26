import { NextRequest, NextResponse } from 'next/server'
import { sendNotificationToGarages, isSMSConfigured } from '@/utils/notificationService'
import { dynamoDB } from '@/utils/dynamoService'
import { PutCommand } from '@aws-sdk/lib-dynamodb'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validate required fields
    const { category, description, brand, model, modelYear, engineCC } = body
    
    if (!category || !description || !brand || !model) {
      return NextResponse.json(
        { error: 'Λείπουν απαραίτητα στοιχεία' },
        { status: 400 }
      )
    }

    // Check if SMS service is configured
    if (!isSMSConfigured()) {
      return NextResponse.json(
        { error: 'SMS service not configured. Please set AWS credentials.' },
        { status: 500 }
      )
    }
    
    // TODO: Uncomment when SNS is properly configured on AWS
    // Send SMS notifications to all registered garages
    // const notificationResult = await sendNotificationToGarages(body)
    
    // Mock notification result for now (SMS disabled)
    const notificationResult = {
      successful: 0,
      failed: 0,
      errors: ['SMS notifications disabled - SNS not configured on AWS yet'],
      messageIds: [],
      summary: 'SMS notifications disabled - SNS not configured on AWS yet'
    }
    
    // Generate unique IDs
    const serviceRequestId = `sr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const vehicleId = `vehicle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    // Save to DynamoDB - remove null values as DynamoDB doesn't like them
    const serviceRequestData: any = {
      id: serviceRequestId,
      clientId: clientId,
      vehicleId: vehicleId,
      category: body.category,
      description: body.description,
      urgency: body.urgency || 'normal',
      status: 'pending',
      photoUrls: body.photoUrls || [], // S3 URLs will be added here
      photos: body.photos || [], // Photo metadata array
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    
    // Only add estimatedCost if it's provided and not null
    if (body.estimatedCost !== undefined && body.estimatedCost !== null) {
      serviceRequestData.estimatedCost = body.estimatedCost
    }
    
    console.log('Service request data to save:', JSON.stringify(serviceRequestData, null, 2))
    
    // Save service request to DynamoDB
    await dynamoDB.send(new PutCommand({
      TableName: 'ServiceRequests',
      Item: serviceRequestData
    }))
    
    // Save vehicle data to DynamoDB - remove null values
    const vehicleData: any = {
      id: vehicleId,
      clientId: clientId,
      brand: body.brand,
      model: body.model,
      modelYear: body.modelYear,
      vinNumber: body.vinNumber,
      engineCC: body.engineCC,
      fuelType: body.fuelType || 'petrol', // Default to petrol if not provided
      isAutomatic: body.isAutomatic !== undefined ? body.isAutomatic : false, // Default to false if not provided
      is4x4: body.is4x4 !== undefined ? body.is4x4 : false, // Default to false if not provided
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    
    // Only add optional fields if they have values
    if (body.engineNumber) vehicleData.engineNumber = body.engineNumber
    if (body.licensePlate) vehicleData.licensePlate = body.licensePlate
    if (body.color) vehicleData.color = body.color
    if (body.nickname) vehicleData.nickname = body.nickname
    if (body.licensePhotoUrl) vehicleData.licensePhotoUrl = body.licensePhotoUrl
    
    console.log('Vehicle data to save:', JSON.stringify(vehicleData, null, 2))
    
    await dynamoDB.send(new PutCommand({
      TableName: 'Vehicles',
      Item: vehicleData
    }))
    
    // Save client data to DynamoDB - remove null values
    const clientData: any = {
      id: clientId,
      firstName: body.firstName || 'Επισκέπτης',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    
    // Only add optional fields if they have values
    if (body.lastName) clientData.lastName = body.lastName
    if (body.email) clientData.email = body.email
    if (body.phoneNumber) clientData.phoneNumber = body.phoneNumber
    if (body.address) clientData.address = body.address
    
    await dynamoDB.send(new PutCommand({
      TableName: 'Clients',
      Item: clientData
    }))
    
    console.log('Service request saved to database:', {
      serviceRequestId,
      clientId,
      vehicleId,
      notificationResult: {
        successful: notificationResult.successful,
        failed: notificationResult.failed,
        messageIds: notificationResult.messageIds
      }
    })

    // Always return success when SMS is disabled, but indicate it in the message
    return NextResponse.json({ 
      success: true, 
      message: notificationResult.summary,
      notificationsSent: notificationResult.successful,
      notificationsFailed: notificationResult.failed,
      messageIds: notificationResult.messageIds,
      serviceRequestId,
      clientId,
      vehicleId,
      note: 'SMS notifications are currently disabled'
    })

  } catch (error) {
    console.error('Error processing service request:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    })
    return NextResponse.json(
      { 
        error: 'Σφάλμα κατά την επεξεργασία του αιτήματος',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

