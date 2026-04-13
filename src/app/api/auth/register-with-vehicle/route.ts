import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { signToken, setAuthCookie } from '@/utils/auth'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'

const checkRateLimit = createRateLimiter('register-vehicle', 3, 3600000)

// Function to check if two vehicles are the same based on unique identifiers
function areVehiclesSame(vehicle1: any, vehicle2: any): boolean {
  // Primary check: VIN number (most reliable unique identifier)
  if (vehicle1.vinNumber && vehicle2.vinNumber && 
      vehicle1.vinNumber.trim().toLowerCase() === vehicle2.vinNumber.trim().toLowerCase()) {
    return true
  }
  
  // Secondary check: Engine number (also unique identifier)
  if (vehicle1.engineNumber && vehicle2.engineNumber && 
      vehicle1.engineNumber.trim().toLowerCase() === vehicle2.engineNumber.trim().toLowerCase()) {
    return true
  }
  
  // If neither VIN nor engine number match, they are different vehicles
  return false
}

async function _POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, firstName, vehicleData, serviceRequestId } = body

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ 
        error: 'Email is required' 
      }, { status: 400 })
    }

    if (!vehicleData) {
      return NextResponse.json({ 
        error: 'Vehicle data is required' 
      }, { status: 400 })
    }

    // Get client IP for rate limiting
    const clientIP = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown'

    // Check rate limit (3 registrations per IP per hour)
    if (!checkRateLimit(clientIP)) {
      return NextResponse.json({ 
        error: 'Πολλές εγγραφές από αυτή τη διεύθυνση. Παρακαλώ δοκιμάστε ξανά σε 1 ώρα.' 
      }, { status: 429 })
    }

    // Check if email already exists
    const scanCommand = new ScanCommand({
      TableName: 'Clients',
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email.trim().toLowerCase()
      }
    })

    const existingResult = await dynamoDB.send(scanCommand)

    if (existingResult.Items && existingResult.Items.length > 0) {
      // User already exists - log them in and check for duplicate vehicle
      const existingClient = existingResult.Items[0]
      
      // Check if this client already has the same vehicle
      const vehiclesScanCommand = new ScanCommand({
        TableName: 'Vehicles',
        FilterExpression: 'clientId = :clientId',
        ExpressionAttributeValues: {
          ':clientId': existingClient.id
        }
      })

      const vehiclesResult = await dynamoDB.send(vehiclesScanCommand)
      
      let existingVehicle = null
      if (vehiclesResult.Items && vehiclesResult.Items.length > 0) {
        // First try to find exact matches by VIN or engine number
        existingVehicle = vehiclesResult.Items.find(vehicle => 
          areVehiclesSame(vehicle, vehicleData)
        )
        
        // If no exact match found but we have VIN or engine number, 
        // also check if the new vehicle has missing data that could be filled
        if (!existingVehicle && (vehicleData.vinNumber || vehicleData.engineNumber)) {
          existingVehicle = vehiclesResult.Items.find(vehicle => {
            // Check if existing vehicle has the same VIN but new vehicle is missing engine number
            if (vehicle.vinNumber && vehicleData.vinNumber && 
                vehicle.vinNumber.trim().toLowerCase() === vehicleData.vinNumber.trim().toLowerCase() &&
                !vehicle.engineNumber && vehicleData.engineNumber) {
              return true
            }
            // Check if existing vehicle has the same engine number but new vehicle is missing VIN
            if (vehicle.engineNumber && vehicleData.engineNumber && 
                vehicle.engineNumber.trim().toLowerCase() === vehicleData.engineNumber.trim().toLowerCase() &&
                !vehicle.vinNumber && vehicleData.vinNumber) {
              return true
            }
            return false
          })
        }
      }

      // If we found a duplicate vehicle and have a service request to update
      if (existingVehicle && serviceRequestId) {
        // Update the existing vehicle with any missing information from the new vehicle
        const updateExpressions = []
        const expressionAttributeValues: any = {
          ':updatedAt': new Date().toISOString()
        }
        
        // Add missing VIN number
        if (!existingVehicle.vinNumber && vehicleData.vinNumber) {
          updateExpressions.push('vinNumber = :vinNumber')
          expressionAttributeValues[':vinNumber'] = vehicleData.vinNumber
        }
        
        // Add missing engine number
        if (!existingVehicle.engineNumber && vehicleData.engineNumber) {
          updateExpressions.push('engineNumber = :engineNumber')
          expressionAttributeValues[':engineNumber'] = vehicleData.engineNumber
        }
        
        // Add missing license plate
        if (!existingVehicle.licensePlate && vehicleData.licensePlate) {
          updateExpressions.push('licensePlate = :licensePlate')
          expressionAttributeValues[':licensePlate'] = vehicleData.licensePlate
        }
        
        // Add missing color
        if (!existingVehicle.color && vehicleData.color) {
          updateExpressions.push('color = :color')
          expressionAttributeValues[':color'] = vehicleData.color
        }
        
        // Update existing vehicle if there are missing fields to fill
        if (updateExpressions.length > 0) {
          const updateVehicleCommand = new UpdateCommand({
            TableName: 'Vehicles',
            Key: {
              id: existingVehicle.id
            },
            UpdateExpression: `SET ${updateExpressions.join(', ')}, updatedAt = :updatedAt`,
            ExpressionAttributeValues: expressionAttributeValues
          })
          await dynamoDB.send(updateVehicleCommand)
        }

        // Update the service request to use the existing vehicle ID
        const updateRequestCommand = new UpdateCommand({
          TableName: 'ServiceRequests',
          Key: {
            id: serviceRequestId
          },
          UpdateExpression: 'SET vehicleId = :existingVehicleId, clientId = :existingClientId, updatedAt = :updatedAt',
          ExpressionAttributeValues: {
            ':existingVehicleId': existingVehicle.id,
            ':existingClientId': existingClient.id,
            ':updatedAt': new Date().toISOString()
          }
        })

        await dynamoDB.send(updateRequestCommand)

        // Delete the duplicate vehicle that was created
        if (vehicleData.id && vehicleData.id !== existingVehicle.id) {
          const deleteVehicleCommand = new DeleteCommand({
            TableName: 'Vehicles',
            Key: {
              id: vehicleData.id
            }
          })
          await dynamoDB.send(deleteVehicleCommand)
        }

        const token1 = await signToken({ userId: existingClient.id, userType: 'client' })
        const response1 = NextResponse.json({
          success: true,
          message: 'Existing user found with matching vehicle (VIN/Engine) - logged in and merged data',
          client: {
            id: existingClient.id,
            firstName: existingClient.firstName,
            email: existingClient.email,
            lastName: existingClient.lastName,
            phoneNumber: existingClient.phoneNumber
          },
          vehicleId: existingVehicle.id,
          isExistingUser: true,
          vehicleDeduplicated: true,
          vehicleMatchReason: existingVehicle.vinNumber && vehicleData.vinNumber ? 'VIN' : 'Engine Number'
        })
        setAuthCookie(response1, token1)
        return response1
      } else {
        // User exists but no duplicate vehicle found - just log them in
        const token2 = await signToken({ userId: existingClient.id, userType: 'client' })
        const response2 = NextResponse.json({
          success: true,
          message: 'Existing user found - logged in successfully',
          client: {
            id: existingClient.id,
            firstName: existingClient.firstName,
            email: existingClient.email,
            lastName: existingClient.lastName,
            phoneNumber: existingClient.phoneNumber
          },
          isExistingUser: true,
          vehicleDeduplicated: false
        })
        setAuthCookie(response2, token2)
        return response2
      }
    }

    // User doesn't exist - create new client (this should not happen in normal flow)
    // as we should have already created a client during service request creation
    const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const clientData = {
      id: clientId,
      firstName: firstName || 'Επισκέπτης',
      email: email.trim().toLowerCase(),
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const putCommand = new PutCommand({
      TableName: 'Clients',
      Item: clientData
    })

    await dynamoDB.send(putCommand)

    const token = await signToken({ userId: clientData.id, userType: 'client' })
    const response = NextResponse.json({
      success: true,
      message: 'Client registered successfully',
      client: {
        id: clientData.id,
        firstName: clientData.firstName,
        email: clientData.email
      },
      isExistingUser: false,
      vehicleDeduplicated: false
    })
    setAuthCookie(response, token)
    return response

  } catch (error) {
    console.error('Registration with vehicle error:', error)
    return NextResponse.json(
      { 
        error: 'Error during registration',
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

export const POST = withMetrics(_POST)
