import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'

// Simple in-memory rate limiting (in production, use Redis or database)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

function checkRateLimit(identifier: string, maxAttempts: number = 5, windowMs: number = 3600000): boolean {
  const now = Date.now()
  const key = `login:${identifier}`
  
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
  console.log('🔧 Login API - Environment Debug:', {
    REGION: process.env.REGION || 'NOT SET',
    NODE_ENV: process.env.NODE_ENV,
    hasAccessKey: !!process.env.ACCESS_KEY_ID,
    hasSecretKey: !!process.env.SECRET_ACCESS_KEY
  })

  try {
    const body = await request.json()
    const { email } = body

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ 
        error: 'Email is required' 
      }, { status: 400 })
    }

    // Get client IP for rate limiting
    const clientIP = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown'

    // Check rate limit (5 attempts per IP per hour)
    if (!checkRateLimit(clientIP, 5, 3600000)) {
      return NextResponse.json({ 
        error: 'Πολλές προσπάθειες σύνδεσης. Παρακαλώ δοκιμάστε ξανά σε 1 ώρα.' 
      }, { status: 429 })
    }

    // Check email-specific rate limit (3 attempts per email per hour)
    if (!checkRateLimit(`email:${email}`, 3, 3600000)) {
      return NextResponse.json({ 
        error: 'Πολλές προσπάθειες για αυτό το email. Παρακαλώ δοκιμάστε ξανά σε 1 ώρα.' 
      }, { status: 429 })
    }

    // Search for client with this email
    const scanCommand = new ScanCommand({
      TableName: 'Clients',
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email.trim().toLowerCase()
      }
    })

    const result = await dynamoDB.send(scanCommand)

    if (result.Items && result.Items.length > 0) {
      // User found
      const client = result.Items[0]
      
      return NextResponse.json({
        success: true,
        client: {
          id: client.id,
          firstName: client.firstName,
          lastName: client.lastName,
          email: client.email,
          phoneNumber: client.phoneNumber
        }
      })
    } else {
      // User not found
      return NextResponse.json({
        success: true,
        client: null,
        message: 'No account found with this email'
      })
    }

  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { 
        error: 'Error during login',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
