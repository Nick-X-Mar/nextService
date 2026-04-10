'use server'

import { NextRequest, NextResponse } from 'next/server'
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { requireAuth } from '@/utils/requireAuth'

const STRING_FIELDS = [
  'brand',
  'model',
  'engineCC',
  'modelYear',
  'year',
  'fuelType',
  'vinNumber',
  'engineNumber'
] as const

const BOOLEAN_FIELDS = ['isAutomatic', 'is4x4', 'isTurbo'] as const

type StringField = (typeof STRING_FIELDS)[number]
type BooleanField = (typeof BOOLEAN_FIELDS)[number]

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ vehicleId: string }> }
) {
  try {
    const { vehicleId } = await params

    // Auth check: require authentication
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    if (!vehicleId) {
      return NextResponse.json(
        { error: 'Vehicle ID is required' },
        { status: 400 }
      )
    }

    // Verify the vehicle belongs to the authenticated user
    const getCommand = new GetCommand({
      TableName: 'Vehicles',
      Key: { id: vehicleId }
    })
    const vehicleResult = await dynamoDB.send(getCommand)
    if (!vehicleResult.Item) {
      return NextResponse.json(
        { error: 'Vehicle not found' },
        { status: 404 }
      )
    }
    if (vehicleResult.Item.clientId !== auth.userId) {
      return NextResponse.json(
        { error: 'Δεν έχετε πρόσβαση σε αυτόν τον πόρο' },
        { status: 403 }
      )
    }

    const body = await request.json()

    if (typeof body !== 'object' || body === null) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }

    const setExpressions: string[] = []
    const removeExpressions: string[] = []
    const expressionAttributeNames: Record<string, string> = {}
    const expressionAttributeValues: Record<string, unknown> = {}

    let hasUpdates = false

    for (const field of STRING_FIELDS) {
      if (field in body) {
        hasUpdates = true
        const value = body[field as StringField]

        if (value === null || (typeof value === 'string' && value.trim() === '')) {
          removeExpressions.push(`#${field}`)
          expressionAttributeNames[`#${field}`] = field
        } else if (typeof value === 'string' || typeof value === 'number') {
          setExpressions.push(`#${field} = :${field}`)
          expressionAttributeNames[`#${field}`] = field
          expressionAttributeValues[`:${field}`] =
            typeof value === 'string' ? value.trim() : value
        } else {
          return NextResponse.json(
            { error: `Invalid value for ${field}` },
            { status: 400 }
          )
        }
      }
    }

    for (const field of BOOLEAN_FIELDS) {
      if (field in body) {
        hasUpdates = true
        const value = body[field as BooleanField]

        if (typeof value === 'boolean') {
          setExpressions.push(`#${field} = :${field}`)
          expressionAttributeNames[`#${field}`] = field
          expressionAttributeValues[`:${field}`] = value
        } else {
          return NextResponse.json(
            { error: `Invalid boolean value for ${field}` },
            { status: 400 }
          )
        }
      }
    }

    if (!hasUpdates) {
      return NextResponse.json(
        { error: 'No valid fields provided for update' },
        { status: 400 }
      )
    }

    setExpressions.push('#updatedAt = :updatedAt')
    expressionAttributeNames['#updatedAt'] = 'updatedAt'
    expressionAttributeValues[':updatedAt'] = new Date().toISOString()

    let updateExpression = ''
    if (setExpressions.length > 0) {
      updateExpression += `SET ${setExpressions.join(', ')}`
    }

    if (removeExpressions.length > 0) {
      if (updateExpression.length > 0) {
        updateExpression += ' '
      }
      updateExpression += `REMOVE ${removeExpressions.join(', ')}`
    }

    const updateCommand = new UpdateCommand({
      TableName: 'Vehicles',
      Key: { id: vehicleId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    })

    const result = await dynamoDB.send(updateCommand)

    if (!result.Attributes) {
      return NextResponse.json(
        { error: 'Vehicle not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      vehicle: result.Attributes
    })
  } catch (error) {
    console.error('Error updating vehicle:', error)
    return NextResponse.json(
      {
        error: 'Δεν ήταν δυνατή η ενημέρωση των στοιχείων του οχήματος',
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

