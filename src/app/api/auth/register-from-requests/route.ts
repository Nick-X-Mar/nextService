import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'

// Simple in-memory rate limiting (in production, use Redis or database)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

function checkRateLimit(identifier: string, maxAttempts: number = 3, windowMs: number = 3600000): boolean {
  const now = Date.now()
  const key = `register-from-requests:${identifier}`
  
  const current = rateLimitMap.get(key)
  
  if (!current || now > current.resetTime) {
    // Reset or create new entry
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs })
    return true
  }
  
  if (current.count >= maxAttempts) {
    return false
  }
  
  current.count++
  return true
}

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { guestClientId, email, firstName, lastName, phoneNumber } = body

    if (!guestClientId || typeof guestClientId !== 'string') {
      return NextResponse.json({ 
        error: 'Guest client ID is required' 
      }, { status: 400 })
    }

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ 
        error: 'Email is required' 
      }, { status: 400 })
    }

    // Get client IP for rate limiting
    const clientIP = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown'

    // Check rate limit (3 registrations per IP per hour)
    if (!checkRateLimit(clientIP, 3, 3600000)) {
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
      // User already exists - handle client and vehicle merging
      const existingClient = existingResult.Items[0]
      
      // Get all service requests for the guest client
      const guestRequestsScan = new ScanCommand({
        TableName: 'ServiceRequests',
        FilterExpression: 'clientId = :guestClientId',
        ExpressionAttributeValues: {
          ':guestClientId': guestClientId
        }
      })

      const guestRequestsResult = await dynamoDB.send(guestRequestsScan)
      
      if (guestRequestsResult.Items && guestRequestsResult.Items.length > 0) {
        // Get vehicle data from the guest client's service requests
        const guestVehicleScan = new ScanCommand({
          TableName: 'Vehicles',
          FilterExpression: 'clientId = :guestClientId',
          ExpressionAttributeValues: {
            ':guestClientId': guestClientId
          }
        })

        const guestVehiclesResult = await dynamoDB.send(guestVehicleScan)
        
        if (guestVehiclesResult.Items && guestVehiclesResult.Items.length > 0) {
          // Check if existing client has matching vehicles
          const existingVehiclesScan = new ScanCommand({
            TableName: 'Vehicles',
            FilterExpression: 'clientId = :existingClientId',
            ExpressionAttributeValues: {
              ':existingClientId': existingClient.id
            }
          })

          const existingVehiclesResult = await dynamoDB.send(existingVehiclesScan)
          
          // Process each guest vehicle
          for (const guestVehicle of guestVehiclesResult.Items) {
            let vehicleMerged = false
            
            // Check if there's a matching existing vehicle
            if (existingVehiclesResult.Items && existingVehiclesResult.Items.length > 0) {
              const existingVehicle = existingVehiclesResult.Items.find(vehicle => 
                areVehiclesSame(vehicle, guestVehicle)
              )
              
              if (existingVehicle) {
                // Merge vehicle data - update existing vehicle with missing info
                const updateExpressions = []
                const expressionAttributeValues: any = {
                  ':updatedAt': new Date().toISOString()
                }
                
                // Add missing VIN number
                if (!existingVehicle.vinNumber && guestVehicle.vinNumber) {
                  updateExpressions.push('vinNumber = :vinNumber')
                  expressionAttributeValues[':vinNumber'] = guestVehicle.vinNumber
                }
                
                // Add missing engine number
                if (!existingVehicle.engineNumber && guestVehicle.engineNumber) {
                  updateExpressions.push('engineNumber = :engineNumber')
                  expressionAttributeValues[':engineNumber'] = guestVehicle.engineNumber
                }
                
                // Add missing license plate
                if (!existingVehicle.licensePlate && guestVehicle.licensePlate) {
                  updateExpressions.push('licensePlate = :licensePlate')
                  expressionAttributeValues[':licensePlate'] = guestVehicle.licensePlate
                }
                
                // Add missing color
                if (!existingVehicle.color && guestVehicle.color) {
                  updateExpressions.push('color = :color')
                  expressionAttributeValues[':color'] = guestVehicle.color
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

                // Update service requests to use existing vehicle and client
                for (const serviceRequest of guestRequestsResult.Items) {
                  const updateRequestCommand = new UpdateCommand({
                    TableName: 'ServiceRequests',
                    Key: {
                      id: serviceRequest.id
                    },
                    UpdateExpression: 'SET vehicleId = :existingVehicleId, clientId = :existingClientId, updatedAt = :updatedAt',
                    ExpressionAttributeValues: {
                      ':existingVehicleId': existingVehicle.id,
                      ':existingClientId': existingClient.id,
                      ':updatedAt': new Date().toISOString()
                    }
                  })
                  await dynamoDB.send(updateRequestCommand)
                }

                // Delete the guest vehicle
                const deleteVehicleCommand = new DeleteCommand({
                  TableName: 'Vehicles',
                  Key: {
                    id: guestVehicle.id
                  }
                })
                await dynamoDB.send(deleteVehicleCommand)
                
                vehicleMerged = true
              }
            }
            
            // If no matching vehicle found, just transfer the vehicle to existing client
            if (!vehicleMerged) {
              const updateVehicleCommand = new UpdateCommand({
                TableName: 'Vehicles',
                Key: {
                  id: guestVehicle.id
                },
                UpdateExpression: 'SET clientId = :existingClientId, updatedAt = :updatedAt',
                ExpressionAttributeValues: {
                  ':existingClientId': existingClient.id,
                  ':updatedAt': new Date().toISOString()
                }
              })
              await dynamoDB.send(updateVehicleCommand)
              
              // Update service requests to use existing client
              for (const serviceRequest of guestRequestsResult.Items) {
                const updateRequestCommand = new UpdateCommand({
                  TableName: 'ServiceRequests',
                  Key: {
                    id: serviceRequest.id
                  },
                  UpdateExpression: 'SET clientId = :existingClientId, updatedAt = :updatedAt',
                  ExpressionAttributeValues: {
                    ':existingClientId': existingClient.id,
                    ':updatedAt': new Date().toISOString()
                  }
                })
                await dynamoDB.send(updateRequestCommand)
              }
            }
          }
        }
      }

      // Update existing client with new information if provided
      const updateExpressions = []
      const expressionAttributeValues: any = {
        ':updatedAt': new Date().toISOString()
      }
      const expressionAttributeNames: any = {}

      if (firstName) {
        updateExpressions.push('#firstName = :firstName')
        expressionAttributeNames['#firstName'] = 'firstName'
        expressionAttributeValues[':firstName'] = firstName
      }
      if (lastName) {
        updateExpressions.push('#lastName = :lastName')
        expressionAttributeNames['#lastName'] = 'lastName'
        expressionAttributeValues[':lastName'] = lastName
      }
      if (phoneNumber) {
        updateExpressions.push('#phoneNumber = :phoneNumber')
        expressionAttributeNames['#phoneNumber'] = 'phoneNumber'
        expressionAttributeValues[':phoneNumber'] = phoneNumber
      }

      if (updateExpressions.length > 0) {
        const updateClientCommand = new UpdateCommand({
          TableName: 'Clients',
          Key: {
            id: existingClient.id
          },
          UpdateExpression: `SET ${updateExpressions.join(', ')}, updatedAt = :updatedAt`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues
        })
        await dynamoDB.send(updateClientCommand)
      }

      // Delete the guest client
      const deleteGuestClientCommand = new DeleteCommand({
        TableName: 'Clients',
        Key: {
          id: guestClientId
        }
      })
      await dynamoDB.send(deleteGuestClientCommand)

      logEvent({
        eventName: EventName.GuestRegisteredFromRequest,
        actorType: 'client',
        actorId: existingClient.id,
        clientId: existingClient.id,
        source: 'api/auth/register-from-requests',
        metadata: { guestClientId, mergedToExisting: true }
      })

      return NextResponse.json({
        success: true,
        message: 'Existing user found - data merged successfully',
        client: {
          id: existingClient.id,
          firstName: firstName || existingClient.firstName,
          lastName: lastName || existingClient.lastName,
          email: existingClient.email,
          phoneNumber: phoneNumber || existingClient.phoneNumber
        },
        isExistingUser: true,
        vehicleDeduplicated: true
      })
    }

    // Email doesn't exist - just update the guest client with the new information
    const updateExpressions = []
    const expressionAttributeValues: any = {
      ':updatedAt': new Date().toISOString()
    }
    const expressionAttributeNames: any = {}

    if (firstName) {
      updateExpressions.push('#firstName = :firstName')
      expressionAttributeNames['#firstName'] = 'firstName'
      expressionAttributeValues[':firstName'] = firstName
    }
    if (lastName) {
      updateExpressions.push('#lastName = :lastName')
      expressionAttributeNames['#lastName'] = 'lastName'
      expressionAttributeValues[':lastName'] = lastName
    }
    if (email) {
      updateExpressions.push('#email = :email')
      expressionAttributeNames['#email'] = 'email'
      expressionAttributeValues[':email'] = email.trim().toLowerCase()
    }
    if (phoneNumber) {
      updateExpressions.push('#phoneNumber = :phoneNumber')
      expressionAttributeNames['#phoneNumber'] = 'phoneNumber'
      expressionAttributeValues[':phoneNumber'] = phoneNumber
    }

    const updateClientCommand = new UpdateCommand({
      TableName: 'Clients',
      Key: {
        id: guestClientId
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}, updatedAt = :updatedAt`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    })

    const { Attributes } = await dynamoDB.send(updateClientCommand)

    if (!Attributes) {
      return NextResponse.json({ error: 'Guest client not found' }, { status: 404 })
    }

    logEvent({
      eventName: EventName.GuestRegisteredFromRequest,
      actorType: 'client',
      actorId: guestClientId,
      clientId: guestClientId,
      source: 'api/auth/register-from-requests',
      metadata: { guestClientId, mergedToExisting: false }
    })

    return NextResponse.json({
      success: true,
      message: 'Guest client updated successfully',
      client: Attributes,
      isExistingUser: false,
      vehicleDeduplicated: false
    })

  } catch (error) {
    console.error('Registration from requests error:', error)
    
    // Log more detailed error information for debugging
    if (error instanceof Error) {
      console.error('Error name:', error.name)
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
    }
    
    return NextResponse.json(
      { 
        error: 'Error during registration',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}
