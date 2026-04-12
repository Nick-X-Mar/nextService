import { NextRequest, NextResponse } from 'next/server'
import { isSMSConfigured } from '@/utils/notificationService'
import { dynamoDB } from '@/utils/dynamoService'
import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { ServiceRequestStatus } from '@/types/statuses'
import { hashPassword } from '@/utils/passwordService'
import { logEvent } from '@/utils/eventLogger'
import { sendEmail } from '@/utils/emailService'
import { EventName, EmailTemplate } from '@/types/events'
import { getAuth } from '@/utils/requireAuth'
import { signToken, setAuthCookie } from '@/utils/auth'

// Helper function to normalize string values for comparison
const normalizeString = (value: string | undefined | null): string => {
  if (!value) return ''
  return value.toString().trim().toLowerCase()
}

// Helper function to compare vehicle data
const areVehiclesSame = (
  original: {
    brand?: string
    model?: string
    modelYear?: string
    engineCC?: string
    fuelType?: string
    isAutomatic?: boolean
    is4x4?: boolean
    vinNumber?: string
    engineNumber?: string
    licensePlate?: string
    color?: string
  },
  current: {
    brand?: string
    model?: string
    modelYear?: string
    engineCC?: string
    fuelType?: string
    isAutomatic?: boolean
    is4x4?: boolean
    vinNumber?: string
    engineNumber?: string
    licensePlate?: string
    color?: string
  }
): boolean => {
  // Compare required fields
  if (normalizeString(original.brand) !== normalizeString(current.brand)) return false
  if (normalizeString(original.model) !== normalizeString(current.model)) return false
  
  // Compare optional fields (handle empty/null values)
  if (normalizeString(original.modelYear) !== normalizeString(current.modelYear)) return false
  if (normalizeString(original.engineCC) !== normalizeString(current.engineCC)) return false
  if (normalizeString(original.fuelType) !== normalizeString(current.fuelType)) return false
  
  // Compare boolean fields
  if (original.isAutomatic !== current.isAutomatic) return false
  if (original.is4x4 !== current.is4x4) return false
  
  // Compare optional identification fields
  if (normalizeString(original.vinNumber) !== normalizeString(current.vinNumber)) return false
  if (normalizeString(original.engineNumber) !== normalizeString(current.engineNumber)) return false
  if (normalizeString(original.licensePlate) !== normalizeString(current.licensePlate)) return false
  if (normalizeString(original.color) !== normalizeString(current.color)) return false
  
  return true
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Use authenticated clientId from JWT when available (set by middleware),
    // falling back to body.clientId for guest users only
    const auth = getAuth(request)
    const existingClientId = auth?.userType === 'client' ? auth.userId : (body.clientId || null)

    // Validate required fields
    const { category, description, brand, model } = body
    
    const missingFields: string[] = []
    if (!category) missingFields.push('Κατηγορία')
    if (!brand) missingFields.push('Μάρκα')
    if (!model) missingFields.push('Μοντέλο')

    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Λείπουν: ${missingFields.join(', ')}` },
        { status: 400 }
      )
    }

    // Check if SMS service is configured
    const smsConfigured = isSMSConfigured()
    if (!smsConfigured) {
      console.log('SMS service not configured - continuing without SMS notifications')
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
    const clientId = existingClientId || `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    // Check if we should use existing vehicle or create a new one
    let vehicleId: string
    let shouldCreateNewVehicle = true
    
    if (body.originalVehicleId && body.originalVehicleData) {
      // Compare current vehicle data with original
      const currentVehicleData = {
        brand: body.brand,
        model: body.model,
        modelYear: body.modelYear,
        engineCC: body.engineCC,
        fuelType: body.fuelType,
        isAutomatic: body.isAutomatic,
        is4x4: body.is4x4,
        vinNumber: body.vinNumber,
        engineNumber: body.engineNumber,
        licensePlate: body.licensePlate,
        color: body.color
      }
      
      if (areVehiclesSame(body.originalVehicleData, currentVehicleData)) {
        // Vehicle data unchanged - use existing vehicle ID
        vehicleId = body.originalVehicleId
        shouldCreateNewVehicle = false
        console.log('Vehicle data unchanged, using existing vehicle ID:', vehicleId)
      } else {
        // Vehicle data changed - create new vehicle
        vehicleId = `vehicle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        shouldCreateNewVehicle = true
        console.log('Vehicle data changed, creating new vehicle with ID:', vehicleId)
      }
    } else if (existingClientId) {
      // Logged-in user: check for existing vehicle by VIN or engine number
      const existingVehicles = await dynamoDB.send(new ScanCommand({
        TableName: 'Vehicles',
        FilterExpression: 'clientId = :clientId',
        ExpressionAttributeValues: { ':clientId': existingClientId }
      }))

      const matchedVehicle = existingVehicles.Items?.find(v => {
        if (body.vinNumber && v.vinNumber && normalizeString(body.vinNumber) === normalizeString(v.vinNumber)) return true
        if (body.engineNumber && v.engineNumber && normalizeString(body.engineNumber) === normalizeString(v.engineNumber)) return true
        return false
      })

      if (matchedVehicle) {
        vehicleId = matchedVehicle.id
        shouldCreateNewVehicle = false
        console.log('Matched existing vehicle for logged-in user:', vehicleId)
      } else {
        vehicleId = `vehicle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        shouldCreateNewVehicle = true
      }
    } else {
      // New guest user - create new vehicle
      vehicleId = `vehicle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      shouldCreateNewVehicle = true
    }
    
    // Save to DynamoDB - remove null values as DynamoDB doesn't like them
    const serviceRequestData: {
      id: string
      clientId: string
      vehicleId: string
      category: string
      description: string
      status: string
      estimatedCost?: number
      photoUrls: string[]
      photos: Array<{
        id: string
        s3Url: string
        s3Key: string
        originalName: string
        fileSize: number
        contentType: string
        description?: string
        uploadedAt: string
      }>
      createdAt: string
      updatedAt: string
    } = {
      id: serviceRequestId,
      clientId: clientId,
      vehicleId: vehicleId,
      category: body.category,
      description: body.description,
      status: ServiceRequestStatus.PENDING,
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
    
    // Only create new vehicle if data was changed or no original vehicle exists
    if (shouldCreateNewVehicle) {
      // Save vehicle data to DynamoDB - remove null values
      const vehicleData: {
        id: string
        clientId: string
        brand: string
        model: string
        modelYear: string
        vinNumber: string
        engineCC: string
        fuelType: string
        isAutomatic: boolean
        is4x4: boolean
        isBrandOther: boolean
        isModelOther: boolean
        isActive: boolean
        createdAt: string
        updatedAt: string
        engineNumber?: string
        licensePlate?: string
        color?: string
        nickname?: string
        licensePhotoUrl?: string
      } = {
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
        isBrandOther: body.isBrandOther || false,
        isModelOther: body.isModelOther || false,
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
    } else {
      console.log('Using existing vehicle, skipping vehicle creation:', vehicleId)
    }
    
    // Only create client if it doesn't already exist
    if (!existingClientId) {
      if (!body.email || !body.password) {
        return NextResponse.json({ error: 'Email και κωδικός είναι υποχρεωτικά' }, { status: 400 })
      }

      // Inline guest registration must record consent the same way the
      // dedicated /register route does — otherwise the user has an account
      // without proof of ToS acceptance.
      if (body.acceptedTerms !== true) {
        return NextResponse.json(
          { error: 'Πρέπει να αποδεχτείς τους Όρους Χρήσης και την Πολιτική Απορρήτου' },
          { status: 400 }
        )
      }

      const normalizedEmail = body.email.trim().toLowerCase()
      const passwordHash = await hashPassword(body.password)
      const nowIso = new Date().toISOString()

      const clientData: Record<string, unknown> = {
        id: clientId,
        firstName: normalizedEmail.split('@')[0],
        email: normalizedEmail,
        passwordHash,
        isActive: true,
        acceptedTermsAt: nowIso,
        acceptedTermsVersion: '1.0',
        createdAt: nowIso,
        updatedAt: nowIso
      }

      if (body.lastName) clientData.lastName = body.lastName
      if (body.phoneNumber) clientData.phoneNumber = body.phoneNumber
      if (body.address) clientData.address = body.address

      await dynamoDB.send(new PutCommand({
        TableName: 'Clients',
        Item: clientData
      }))
    }
    
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

    logEvent({
      eventName: EventName.ServiceRequestSubmitted,
      actorType: 'client',
      actorId: clientId,
      clientId,
      requestId: serviceRequestId,
      source: 'api/service-request',
      metadata: {
        category: body.category,
        brand: body.brand,
        model: body.model,
        vehicleId,
        isGuest: !existingClientId
      }
    })

    // Confirmation email to the client. For guest registrations we have the
    // address straight from the body; for logged-in clients we'd need to look
    // it up — skip if we don't have it locally to avoid an extra DB hit.
    const recipientEmail = body.email && typeof body.email === 'string'
      ? body.email.trim().toLowerCase()
      : undefined
    if (recipientEmail) {
      sendEmail({
        to: recipientEmail,
        templateName: EmailTemplate.RequestConfirmation,
        variables: {
          brand: body.brand || '',
          model: body.model || '',
          category: body.category || '',
          clientId
        },
        triggerEvent: EventName.ServiceRequestSubmitted,
        clientId,
        requestId: serviceRequestId
      })
    }

    // Always return success when SMS is disabled, but indicate it in the message
    const response = NextResponse.json({
      success: true,
      message: notificationResult.summary,
      notificationsSent: notificationResult.successful,
      notificationsFailed: notificationResult.failed,
      messageIds: notificationResult.messageIds,
      serviceRequestId,
      clientId,
      vehicleId,
      note: smsConfigured ? 'SMS notifications sent' : 'SMS notifications are currently disabled'
    })

    // Auto-login: set auth cookie when a new client was created
    if (!existingClientId) {
      const token = await signToken({ userId: clientId, userType: 'client' })
      setAuthCookie(response, token)
    }

    return response

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
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

