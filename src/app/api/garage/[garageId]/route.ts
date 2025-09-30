import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'

export async function GET(
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
    const scanCommand = new ScanCommand({
      TableName: 'Garages',
      FilterExpression: 'id = :garageId',
      ExpressionAttributeValues: {
        ':garageId': garageId
      }
    })

    const result = await dynamoDB.send(scanCommand)

    if (!result.Items || result.Items.length === 0) {
      return NextResponse.json({ 
        error: 'Garage not found' 
      }, { status: 404 })
    }

    const garage = result.Items[0]

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
        createdAt: garage.createdAt,
        updatedAt: garage.updatedAt
      }
    })

  } catch (error) {
    console.error('Error fetching garage data:', error)
    return NextResponse.json(
      { 
        error: 'Error fetching garage data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ garageId: string }> }
) {
  try {
    const { garageId } = await params
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

    // Update garage data
    const updateCommand = new UpdateCommand({
      TableName: 'Garages',
      Key: { id: garageId },
      UpdateExpression: 'SET companyName = :companyName, email = :email, mobile = :mobile, address = :address, tin = :tin, taxAuthority = :taxAuthority, description = :description, isActive = :isActive, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':companyName': body.companyName,
        ':email': body.email,
        ':mobile': body.mobile,
        ':address': body.address,
        ':tin': body.tin,
        ':taxAuthority': body.taxAuthority,
        ':description': body.description || '',
        ':isActive': true,
        ':updatedAt': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    })

    const result = await dynamoDB.send(updateCommand)

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
        createdAt: result.Attributes?.createdAt,
        updatedAt: result.Attributes?.updatedAt
      }
    })

  } catch (error) {
    console.error('Error updating garage data:', error)
    return NextResponse.json(
      { 
        error: 'Error updating garage data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
