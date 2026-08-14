import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { queryIndexOrScan } from '@/utils/indexQuery'
import { hashPassword } from '@/utils/passwordService'
import { MIN_PASSWORD_LENGTH } from '@/utils/passwordPolicy'
import { logEvent } from '@/utils/eventLogger'
import { sendEmail } from '@/utils/emailService'
import { EventName, EmailTemplate } from '@/types/events'
import { signToken, setAuthCookie } from '@/utils/auth'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'
import { randomUUID } from 'crypto'

const checkRateLimit = createRateLimiter('register-pro', 3, 3600000)

// Bumped whenever the legal text changes — every signup record has the
// version it agreed to so we can prove what they accepted at the time.
const CURRENT_TERMS_VERSION = '1.0'

async function _POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { companyName, contactFirstName, contactLastName, tin, email, password, taxAuthority, address, mobile, benefits, services, acceptedTerms } = body

    if (acceptedTerms !== true) {
      return NextResponse.json(
        { error: 'Πρέπει να αποδεχτείτε τους Όρους Χρήσης και την Πολιτική Απορρήτου' },
        { status: 400 }
      )
    }

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


    if (!password || typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json({
        error: `Ο κωδικός πρέπει να έχει τουλάχιστον ${MIN_PASSWORD_LENGTH} χαρακτήρες`
      }, { status: 400 })
    }

    // Basic email validation
    const normalizedEmail = email.trim().toLowerCase()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(normalizedEmail)) {
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
    if (!checkRateLimit(clientIP)) {
      return NextResponse.json({ 
        error: 'Πολλές εγγραφές από αυτή τη διεύθυνση. Παρακαλώ δοκιμάστε ξανά σε 1 ώρα.' 
      }, { status: 429 })
    }

    // Check if TIN already exists (primary duplicate check for Greek companies).
    // Garages.TINIndex is keyed on tin. It is declared in the CDK stack but the
    // local tables are not built from it, so this tolerates the index being
    // absent instead of failing registration outright.
    const existingTins = await queryIndexOrScan<{ id: string }>({
      table: 'Garages',
      indexName: 'TINIndex',
      keyConditionExpression: 'tin = :tin',
      scanFilterExpression: 'tin = :tin',
      expressionAttributeValues: { ':tin': cleanTin },
      limit: 1,
    })

    if (existingTins.length > 0) {
      return NextResponse.json({ 
        error: 'Υπάρχει ήδη εταιρεία με αυτόν τον ΑΦΜ. Ο ΑΦΜ είναι μοναδικός αναγνωριστικός αριθμός για κάθε εταιρεία.' 
      }, { status: 409 })
    }

    // Reject a duplicate email. Only the TIN was checked before, so two
    // garages could register with the same address — and since login looks a
    // user up by email and takes the first hit, one of them would simply never
    // be able to sign in. Uses the EmailIndex added to the Garages table.
    const existingEmailResult = await dynamoDB.send(
      new QueryCommand({
        TableName: 'Garages',
        IndexName: 'EmailIndex',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': normalizedEmail },
        Limit: 1
      })
    )

    if (existingEmailResult.Items && existingEmailResult.Items.length > 0) {
      return NextResponse.json({
        error: 'Υπάρχει ήδη λογαριασμός με αυτό το email.'
      }, { status: 409 })
    }

    // Generate unique garage ID
    const garageId = `garage-${randomUUID()}`

    // Create new garage
    const passwordHash = await hashPassword(password)

    const nowIso = new Date().toISOString()
    const garageData = {
      id: garageId,
      companyName: companyName.trim(),
      contactFirstName: contactFirstName ? contactFirstName.trim() : '',
      contactLastName: contactLastName ? contactLastName.trim() : '',
      tin: cleanTin,
      email: normalizedEmail,
      passwordHash,
      taxAuthority: taxAuthority.trim(),
      address: address.trim(),
      mobile: cleanMobile,
      isActive: false,
      description: 'Εταιρεία εγγεγραμμένη στο NextService',
      benefits: benefits && Array.isArray(benefits) ? benefits : [],
      services: services && Array.isArray(services) ? services : [],
      acceptedTermsAt: nowIso,
      acceptedTermsVersion: CURRENT_TERMS_VERSION,
      createdAt: nowIso,
      updatedAt: nowIso
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
      variables: { companyName: garageData.companyName, garageId },
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

    const token = await signToken({ userId: garageData.id, userType: 'garage' })
    const response = NextResponse.json({
      success: true,
      message: 'Η εταιρεία εγγράφηκε επιτυχώς. Θα επικοινωνήσουμε μαζί σας σύντομα για την ενεργοποίηση.',
      garage: {
        id: garageData.id,
        companyName: garageData.companyName,
        email: garageData.email,
        isActive: garageData.isActive
      }
    })
    setAuthCookie(response, token)
    return response

  } catch (error) {
    console.error('Professional registration error:', error)
    return NextResponse.json(
      { 
        error: 'Σφάλμα κατά την εγγραφή της εταιρείας',
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

export const POST = withMetrics(_POST)
