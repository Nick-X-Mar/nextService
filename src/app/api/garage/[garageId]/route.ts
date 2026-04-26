import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { logEvent } from '@/utils/eventLogger'
import { sendEmail } from '@/utils/emailService'
import { EventName, EmailTemplate } from '@/types/events'
import { requireOwner } from '@/utils/requireAuth'
import { withMetrics } from '@/utils/withMetrics'

async function _GET(
  request: NextRequest,
  { params }: { params: Promise<{ garageId: string }> }
) {
  try {
    const { garageId } = await params

    if (!garageId) {
      return NextResponse.json({ 
        error: 'Garage ID is required' 
      }, { status: 400 })
    }

    // Get garage data from database
    const result = await dynamoDB.send(new GetCommand({
      TableName: 'Garages',
      Key: { id: garageId }
    }))

    if (!result.Item) {
      return NextResponse.json({
        error: 'Garage not found'
      }, { status: 404 })
    }

    const garage = result.Item

    return NextResponse.json({
      success: true,
      garage: {
        id: garage.id,
        companyName: garage.companyName,
        email: garage.email,
        mobile: garage.mobile,
        address: garage.address,
        tin: garage.tin,
        taxAuthority: garage.taxAuthority,
        description: garage.description,
        isActive: garage.isActive,
        benefits: garage.benefits || [],
        createdAt: garage.createdAt,
        updatedAt: garage.updatedAt
      }
    })

  } catch (error) {
    console.error('Error fetching garage data:', error)
    return NextResponse.json(
      { 
        error: 'Error fetching garage data',
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

async function _PUT(
  request: NextRequest,
  { params }: { params: Promise<{ garageId: string }> }
) {
  try {
    const { garageId } = await params

    const ownerAuth = requireOwner(request, garageId)
    if (ownerAuth instanceof NextResponse) return ownerAuth

    const body = await request.json()

    if (!garageId) {
      return NextResponse.json({ 
        error: 'Garage ID is required' 
      }, { status: 400 })
    }

    // Validate required fields
    const requiredFields = ['companyName', 'email', 'mobile', 'address', 'tin', 'taxAuthority']
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json({ 
          error: `${field} is required` 
        }, { status: 400 })
      }
    }

    // Validate TIN format (should be 9 digits)
    if (!/^\d{9}$/.test(body.tin)) {
      return NextResponse.json({ 
        error: 'TIN must be exactly 9 digits' 
      }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(body.email)) {
      return NextResponse.json({ 
        error: 'Invalid email format' 
      }, { status: 400 })
    }

    // Snapshot previous isActive so we can detect a false→true transition
    // (i.e. "garage_validated"). Best-effort: if the lookup fails we just
    // skip the event.
    let wasInactive = false
    try {
      const prev = await dynamoDB.send(new GetCommand({ TableName: 'Garages', Key: { id: garageId } }))
      wasInactive = prev.Item?.isActive === false
    } catch {
      // ignore
    }

    // Update garage data
    const updateCommand = new UpdateCommand({
      TableName: 'Garages',
      Key: { id: garageId },
      UpdateExpression: 'SET companyName = :companyName, email = :email, mobile = :mobile, address = :address, tin = :tin, taxAuthority = :taxAuthority, description = :description, benefits = :benefits, isActive = :isActive, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':companyName': body.companyName,
        ':email': body.email,
        ':mobile': body.mobile,
        ':address': body.address,
        ':tin': body.tin,
        ':taxAuthority': body.taxAuthority,
        ':description': body.description || '',
        ':benefits': body.benefits || [],
        ':isActive': true,
        ':updatedAt': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    })

    const result = await dynamoDB.send(updateCommand)

    if (wasInactive && result.Attributes?.isActive === true) {
      logEvent({
        eventName: EventName.GarageValidated,
        actorType: 'system',
        garageId,
        source: 'api/garage/[garageId]',
        metadata: { companyName: result.Attributes?.companyName }
      })

      const garageEmail = result.Attributes?.email as string | undefined
      if (garageEmail) {
        sendEmail({
          to: garageEmail,
          templateName: EmailTemplate.GarageActivated,
          variables: { companyName: (result.Attributes?.companyName as string) || '' },
          triggerEvent: EventName.GarageValidated,
          garageId
        })
      }
    }

    return NextResponse.json({
      success: true,
      garage: {
        id: result.Attributes?.id,
        companyName: result.Attributes?.companyName,
        email: result.Attributes?.email,
        mobile: result.Attributes?.mobile,
        address: result.Attributes?.address,
        tin: result.Attributes?.tin,
        taxAuthority: result.Attributes?.taxAuthority,
        description: result.Attributes?.description,
        isActive: result.Attributes?.isActive,
        benefits: result.Attributes?.benefits || [],
        createdAt: result.Attributes?.createdAt,
        updatedAt: result.Attributes?.updatedAt
      }
    })

  } catch (error) {
    console.error('Error updating garage data:', error)
    return NextResponse.json(
      { 
        error: 'Error updating garage data',
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

export const GET = withMetrics(_GET)
export const PUT = withMetrics(_PUT)
