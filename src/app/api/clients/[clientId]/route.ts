import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { getAuth, requireOwner } from '@/utils/requireAuth'
import { withMetrics } from '@/utils/withMetrics'

async function _GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params

    // Auth check: allow client viewing own profile or any garage
    const auth = getAuth(request)
    if (!auth) {
      return NextResponse.json({ error: 'Απαιτείται σύνδεση' }, { status: 401 })
    }
    if (auth.userId !== clientId && auth.userType !== 'garage') {
      return NextResponse.json({ error: 'Δεν έχετε πρόσβαση σε αυτόν τον πόρο' }, { status: 403 })
    }

    if (!clientId) {
      return NextResponse.json(
        { error: 'Client ID is required' },
        { status: 400 }
      )
    }

    // Basic validation for clientId format (should start with 'client-')
    if (!clientId.startsWith('client-')) {
      return NextResponse.json(
        { error: 'Invalid client ID format' },
        { status: 400 }
      )
    }

    // Get client information from DynamoDB
    const getCommand = new GetCommand({
      TableName: 'Clients',
      Key: {
        id: clientId
      }
    })

    const result = await dynamoDB.send(getCommand)
    
    if (!result.Item) {
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      )
    }

    // Return client data (excluding sensitive information)
    const clientData = {
      id: result.Item.id,
      firstName: result.Item.firstName,
      lastName: result.Item.lastName,
      email: result.Item.email,
      phoneNumber: result.Item.phoneNumber,
      address: result.Item.address,
      isActive: result.Item.isActive,
      createdAt: result.Item.createdAt,
      updatedAt: result.Item.updatedAt
    }

    return NextResponse.json({
      success: true,
      client: clientData
    })

  } catch (error) {
    console.error('Error fetching client:', error)
    return NextResponse.json(
      { 
        error: 'Σφάλμα κατά την ανάκτηση των πληροφοριών πελάτη',
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

async function _PUT(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params

    // Auth check: only the client can edit their own profile
    const auth = requireOwner(request, clientId)
    if (auth instanceof NextResponse) return auth

    const body = await request.json()

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 })
    }

    // Validate required fields
    if (!body.email) {
      return NextResponse.json({ 
        error: 'Email is required' 
      }, { status: 400 })
    }

    // Prepare update expression and values
    const setExpressions: string[] = []
    const removeExpressions: string[] = []
    const expressionAttributeNames: Record<string, string> = {}
    const expressionAttributeValues: Record<string, string | number | boolean> = {}

    // Add fields to update
    if (body.firstName) {
      setExpressions.push('#firstName = :firstName')
      expressionAttributeNames['#firstName'] = 'firstName'
      expressionAttributeValues[':firstName'] = body.firstName
    } else {
      // Set default firstName if not provided
      setExpressions.push('#firstName = :firstName')
      expressionAttributeNames['#firstName'] = 'firstName'
      expressionAttributeValues[':firstName'] = 'Επισκέπτης'
    }

    if (body.lastName) {
      setExpressions.push('#lastName = :lastName')
      expressionAttributeNames['#lastName'] = 'lastName'
      expressionAttributeValues[':lastName'] = body.lastName
    }

    if (body.email !== undefined) {
      if (body.email === null) {
        // Remove the email field if null is provided
        removeExpressions.push('#email')
        expressionAttributeNames['#email'] = 'email'
      } else {
        // Set the email field if a value is provided
        setExpressions.push('#email = :email')
        expressionAttributeNames['#email'] = 'email'
        expressionAttributeValues[':email'] = body.email
      }
    }

    if (body.phoneNumber) {
      setExpressions.push('#phoneNumber = :phoneNumber')
      expressionAttributeNames['#phoneNumber'] = 'phoneNumber'
      expressionAttributeValues[':phoneNumber'] = body.phoneNumber
    }

    // Add updatedAt timestamp
    setExpressions.push('#updatedAt = :updatedAt')
    expressionAttributeNames['#updatedAt'] = 'updatedAt'
    expressionAttributeValues[':updatedAt'] = new Date().toISOString()

    // Build the update expression
    let updateExpression = ''
    if (setExpressions.length > 0) {
      updateExpression += `SET ${setExpressions.join(', ')}`
    }
    if (removeExpressions.length > 0) {
      if (updateExpression) updateExpression += ' '
      updateExpression += `REMOVE ${removeExpressions.join(', ')}`
    }

    const updateCommand = new UpdateCommand({
      TableName: 'Clients',
      Key: { id: clientId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    })

    const { Attributes } = await dynamoDB.send(updateCommand)

    if (!Attributes) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Client updated successfully',
      client: Attributes 
    })

  } catch (error) {
    console.error('Error updating client:', error)
    return NextResponse.json(
      { error: 'Error updating client details', details: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const GET = withMetrics(_GET)
export const PUT = withMetrics(_PUT)
