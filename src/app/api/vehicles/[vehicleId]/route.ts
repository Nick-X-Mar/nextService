'use server'

import { NextRequest, NextResponse } from 'next/server'
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { requireAuth } from '@/utils/requireAuth'
import { withMetrics } from '@/utils/withMetrics'
import { presentVehicle } from '@/app/api/vehicles/vehicleView'
import { normalizeEngineCC } from '@/app/api/vehicles/engineCC'

/**
 * Editable text fields and how each one is checked. `required` fields can be changed
 * but never cleared — a vehicle with no brand or model is unusable everywhere else.
 * licensePlate / color / nickname used to be missing here entirely, so the profile's
 * edits to them came back "saved" and were silently dropped.
 */
const STRING_FIELDS: Record<string, { max: number; pattern?: RegExp; required?: boolean; upper?: boolean; error: string }> = {
  brand: { max: 60, required: true, error: 'Η μάρκα είναι υποχρεωτική (έως 60 χαρακτήρες)' },
  model: { max: 60, required: true, error: 'Το μοντέλο είναι υποχρεωτικό (έως 60 χαρακτήρες)' },
  engineCC: { max: 5, pattern: /^\d{2,5}$/, error: 'Ο κυβισμός πρέπει να είναι αριθμός (π.χ. 1600)' },
  modelYear: { max: 4, pattern: /^\d{4}$/, error: 'Το έτος πρέπει να έχει 4 ψηφία (π.χ. 2018)' },
  year: { max: 4, pattern: /^\d{4}$/, error: 'Το έτος πρέπει να έχει 4 ψηφία (π.χ. 2018)' },
  fuelType: { max: 20, pattern: /^(petrol|diesel|hybrid|electric|lpg|cng)$/, error: 'Μη έγκυρος τύπος καυσίμου' },
  vinNumber: { max: 32, upper: true, error: 'Ο αριθμός πλαισίου έχει όριο 32 χαρακτήρες' },
  engineNumber: { max: 32, upper: true, error: 'Ο αριθμός κινητήρα έχει όριο 32 χαρακτήρες' },
  licensePlate: { max: 20, upper: true, error: 'Η πινακίδα έχει όριο 20 χαρακτήρες' },
  color: { max: 40, error: 'Το χρώμα έχει όριο 40 χαρακτήρες' },
  nickname: { max: 60, error: 'Το ψευδώνυμο έχει όριο 60 χαρακτήρες' },
}

const BOOLEAN_FIELDS = ['isAutomatic', 'is4x4', 'isTurbo'] as const

const MAX_YEAR = () => new Date().getFullYear() + 1

async function _PATCH(
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
    if (auth.userType !== 'client' || vehicleResult.Item.clientId !== auth.userId) {
      return NextResponse.json(
        { error: 'Δεν έχετε πρόσβαση σε αυτόν τον πόρο' },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => null)

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
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
    const stored = vehicleResult.Item

    for (const [field, rule] of Object.entries(STRING_FIELDS)) {
      if (!(field in body)) continue
      hasUpdates = true
      const raw = body[field]

      // The profile sends every field back on save. One the customer did not touch is
      // not an edit, and a value stored before these rules existed ("1600cc") must not
      // make saving the nickname next to it fail.
      if ((typeof raw === 'string' || typeof raw === 'number') && String(raw).trim() === String(stored[field] ?? '').trim()) {
        continue
      }

      if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
        if (rule.required) {
          return NextResponse.json({ error: rule.error }, { status: 400 })
        }
        removeExpressions.push(`#${field}`)
        expressionAttributeNames[`#${field}`] = field
        continue
      }

      if (typeof raw !== 'string' && typeof raw !== 'number') {
        return NextResponse.json({ error: rule.error }, { status: 400 })
      }

      let value = String(raw).trim()
      if (rule.upper) value = value.toUpperCase()
      if (field === 'engineCC') value = normalizeEngineCC(value)
      if (value.length > rule.max || (rule.pattern && !rule.pattern.test(value))) {
        return NextResponse.json({ error: rule.error }, { status: 400 })
      }
      if ((field === 'modelYear' || field === 'year') && (Number(value) < 1950 || Number(value) > MAX_YEAR())) {
        return NextResponse.json({ error: 'Μη έγκυρο έτος μοντέλου' }, { status: 400 })
      }

      setExpressions.push(`#${field} = :${field}`)
      expressionAttributeNames[`#${field}`] = field
      expressionAttributeValues[`:${field}`] = value
    }

    for (const field of BOOLEAN_FIELDS) {
      if (field in body) {
        hasUpdates = true
        const value = body[field]

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

    // The owner check above is a read; pin the write to the same owner so the row
    // can't change hands (or vanish) between the two.
    expressionAttributeNames['#clientId'] = 'clientId'
    expressionAttributeValues[':owner'] = auth.userId

    let updateExpression = `SET ${setExpressions.join(', ')}`
    if (removeExpressions.length > 0) {
      updateExpression += ` REMOVE ${removeExpressions.join(', ')}`
    }

    const updateCommand = new UpdateCommand({
      TableName: 'Vehicles',
      Key: { id: vehicleId },
      UpdateExpression: updateExpression,
      ConditionExpression: '#clientId = :owner',
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    })

    let result
    try {
      result = await dynamoDB.send(updateCommand)
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        return NextResponse.json(
          { error: 'Το όχημα δεν είναι πλέον διαθέσιμο για επεξεργασία.' },
          { status: 409 }
        )
      }
      throw error
    }

    if (!result.Attributes) {
      return NextResponse.json(
        { error: 'Vehicle not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      vehicle: await presentVehicle(result.Attributes)
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

export const PATCH = withMetrics(_PATCH)
