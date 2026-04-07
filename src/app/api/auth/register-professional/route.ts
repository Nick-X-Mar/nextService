import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { hashPassword } from '@/utils/passwordService'
import { logEvent } from '@/utils/eventLogger'
import { sendEmail } from '@/utils/emailService'
import { EventName, EmailTemplate } from '@/types/events'

// Simple in-memory rate limiting (in production, use Redis or database)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

function checkRateLimit(identifier: string, maxAttempts: number = 3, windowMs: number = 3600000): boolean {
  const now = Date.now()
  const key = `register-professional:${identifier}`
  
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
    const { companyName, contactFirstName, contactLastName, tin, email, password, taxAuthority, address, mobile, benefits, services } = body

    // Validate required fields
    if (!companyName || typeof companyName !== 'string' || !companyName.trim()) {
      return NextResponse.json({ 
        error: 'Η επωνυμία της εταιρείας είναι υποχρεωτική' 
      }, { status: 400 })
    }

    if (!tin || typeof tin !== 'string' || !tin.trim()) {
      return NextResponse.json({ 
        error: 'Ο ΑΦΜ είναι υποχρεωτικός' 
      }, { status: 400 })
    }

    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ 
        error: 'Το email είναι υποχρεωτικό' 
      }, { status: 400 })
    }

    if (!taxAuthority || typeof taxAuthority !== 'string' || !taxAuthority.trim()) {
      return NextResponse.json({ 
        error: 'Η ΔΟΥ είναι υποχρεωτική' 
      }, { status: 400 })
    }

    if (!address || typeof address !== 'string' || !address.trim()) {
      return NextResponse.json({ 
        error: 'Η διεύθυνση είναι υποχρεωτική' 
      }, { status: 400 })
    }

    if (!mobile || typeof mobile !== 'string' || !mobile.trim()) {
      return NextResponse.json({ 
        error: 'Ο αριθμός κινητού είναι υποχρεωτικός' 
      }, { status: 400 })
    }


    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({
        error: 'Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες'
      }, { status: 400 })
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ 
        error: 'Παρακαλώ εισάγετε ένα έγκυρο email' 
      }, { status: 400 })
    }

    // TIN validation (Greek format - 9 digits)
    const tinRegex = /^[0-9]{9}$/
    const cleanTin = tin.replace(/\s/g, '')
    if (!tinRegex.test(cleanTin)) {
      return NextResponse.json({ 
        error: 'Ο ΑΦΜ πρέπει να είναι 9 ψηφία' 
      }, { status: 400 })
    }

    // Mobile validation (Greek format)
    const mobileRegex = /^(\+30|0)?[0-9]{10}$/
    const cleanMobile = mobile.replace(/\s/g, '')
    if (!mobileRegex.test(cleanMobile)) {
      return NextResponse.json({ 
        error: 'Παρακαλώ εισάγετε ένα έγκυρο αριθμό κινητού' 
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

    // Check if TIN already exists (primary duplicate check for Greek companies)
    const tinScanCommand = new ScanCommand({
      TableName: 'Garages',
      FilterExpression: 'tin = :tin',
      ExpressionAttributeValues: {
        ':tin': cleanTin
      }
    })

    const existingTinResult = await dynamoDB.send(tinScanCommand)

    if (existingTinResult.Items && existingTinResult.Items.length > 0) {
      return NextResponse.json({ 
        error: 'Υπάρχει ήδη εταιρεία με αυτόν τον ΑΦΜ. Ο ΑΦΜ είναι μοναδικός αναγνωριστικός αριθμός για κάθε εταιρεία.' 
      }, { status: 409 })
    }

    // Generate unique garage ID
    const garageId = `garage-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // Create new garage
    const passwordHash = await hashPassword(password)

    const garageData = {
      id: garageId,
      companyName: companyName.trim(),
      contactFirstName: contactFirstName ? contactFirstName.trim() : '',
      contactLastName: contactLastName ? contactLastName.trim() : '',
      tin: cleanTin,
      email: email.trim().toLowerCase(),
      passwordHash,
      taxAuthority: taxAuthority.trim(),
      address: address.trim(),
      mobile: cleanMobile,
      isActive: false,
      description: 'Εταιρεία εγγεγραμμένη στο NextService',
      benefits: benefits && Array.isArray(benefits) ? benefits : [],
      services: services && Array.isArray(services) ? services : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const putCommand = new PutCommand({
      TableName: 'Garages',
      Item: garageData
    })

    await dynamoDB.send(putCommand)

    logEvent({
      eventName: EventName.GarageRegistered,
      actorType: 'garage',
      actorId: garageId,
      garageId,
      source: 'api/auth/register-professional',
      metadata: { companyName: garageData.companyName, tin: cleanTin }
    })

    // Welcome the new garage and let them know we're reviewing.
    sendEmail({
      to: garageData.email,
      templateName: EmailTemplate.WelcomeGarage,
      variables: { companyName: garageData.companyName },
      triggerEvent: EventName.GarageRegistered,
      garageId
    })

    // Notify admin so we don't miss new garages waiting for validation.
    const adminEmail = process.env.ADMIN_EMAIL
    if (adminEmail) {
      sendEmail({
        to: adminEmail,
        templateName: EmailTemplate.AdminNewGarageValidation,
        variables: {
          companyName: garageData.companyName,
          tin: cleanTin,
          email: garageData.email,
          mobile: cleanMobile,
          address: garageData.address
        },
        triggerEvent: EventName.GarageRegistered,
        garageId
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Η εταιρεία εγγράφηκε επιτυχώς. Θα επικοινωνήσουμε μαζί σας σύντομα για την ενεργοποίηση.',
      garage: {
        id: garageData.id,
        companyName: garageData.companyName,
        email: garageData.email,
        isActive: garageData.isActive
      }
    })

  } catch (error) {
    console.error('Professional registration error:', error)
    return NextResponse.json(
      { 
        error: 'Σφάλμα κατά την εγγραφή της εταιρείας',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
