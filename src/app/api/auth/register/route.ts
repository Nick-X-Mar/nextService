import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'

// Simple in-memory rate limiting (in production, use Redis or database)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

function checkRateLimit(identifier: string, maxAttempts: number = 3, windowMs: number = 3600000): boolean {
  const now = Date.now()
  const key = `register:${identifier}`
  
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, firstName } = body

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
      // User already exists - return the existing client data instead of error
      const existingClient = existingResult.Items[0]
      
      return NextResponse.json({
        success: true,
        message: 'Existing user found - logged in successfully',
        client: {
          id: existingClient.id,
          firstName: existingClient.firstName,
          email: existingClient.email,
          lastName: existingClient.lastName,
          phoneNumber: existingClient.phoneNumber
        },
        isExistingUser: true
      })
    }

    // Generate unique client ID
    const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // Create new client
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

    return NextResponse.json({
      success: true,
      message: 'Client registered successfully',
      client: {
        id: clientData.id,
        firstName: clientData.firstName,
        email: clientData.email
      }
    })

  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { 
        error: 'Error during registration',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
