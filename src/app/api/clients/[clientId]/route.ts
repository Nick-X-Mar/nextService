import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { requireClientOwner } from '@/app/api/clients/requireClientOwner'
import { withMetrics } from '@/utils/withMetrics'
import { TABLES } from '@/lib/tables'

async function _GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params

    // The owner only. This used to let any garage session — pending and
    // deactivated ones included — read any client's email, phone and address
    // by id, which no garage screen ever needed: a garage sees a client only
    // through the request it is quoting or has won (see garageClientView).
    const auth = requireClientOwner(request, clientId)
    if (auth instanceof NextResponse) return auth

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
      TableName: TABLES.Clients,
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

    return NextResponse.json({
      success: true,
      client: presentClient(result.Item)
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** What the profile screens get back — never the password hash or other internals. */
function presentClient(item: Record<string, unknown>) {
  return {
    id: item.id,
    firstName: item.firstName,
    lastName: item.lastName,
    email: item.email,
    phoneNumber: item.phoneNumber,
    address: item.address,
    isActive: item.isActive,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  }
}

async function _PUT(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params

    // Auth check: only the client can edit their own profile
    const auth = requireClientOwner(request, clientId)
    if (auth instanceof NextResponse) return auth

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Μη έγκυρο αίτημα' }, { status: 400 })
    }

    // Login lowercases what it is given, so an address stored as typed ("Maria@…")
    // could never be matched again and the owner was locked out of their account.
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!email) {
      return NextResponse.json({ error: 'Το email είναι υποχρεωτικό' }, { status: 400 })
    }
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      return NextResponse.json({ error: 'Μη έγκυρη διεύθυνση email' }, { status: 400 })
    }

    let firstName = typeof body.firstName === 'string' ? body.firstName.trim() : ''
    if (firstName.length > 60) {
      return NextResponse.json({ error: 'Το όνομα έχει όριο 60 χαρακτήρες' }, { status: 400 })
    }

    // Older accounts were given their email's local part as `firstName`
    // ("maria.papadopoulou84"). Garages are shown a first name before they win
    // a job, and `quotingFirstName` hides such a value only while it still
    // matches the current address — so when the address changes, the old local
    // part becomes the placeholder instead of outliving the email it came from.
    if (firstName) {
      const current = (await dynamoDB.send(new GetCommand({
        TableName: TABLES.Clients,
        Key: { id: clientId },
        ProjectionExpression: 'email',
      }))).Item
      const oldLocal = typeof current?.email === 'string' ? current.email.split('@')[0].toLowerCase() : ''
      if (oldLocal && firstName.toLowerCase() === oldLocal && email !== String(current?.email).toLowerCase()) {
        firstName = ''
      }
    }

    // Optional fields: a value sets it, an empty string clears it, absent leaves it.
    const optional: Record<string, { max: number; pattern?: RegExp; error: string }> = {
      lastName: { max: 60, error: 'Το επώνυμο έχει όριο 60 χαρακτήρες' },
      phoneNumber: { max: 20, pattern: /^\+?[\d\s-]{6,20}$/, error: 'Μη έγκυρος αριθμός τηλεφώνου' },
      address: { max: 200, error: 'Η διεύθυνση έχει όριο 200 χαρακτήρες' },
    }

    const setExpressions: string[] = [
      '#email = :email',
      '#firstName = :firstName',
      '#updatedAt = :updatedAt'
    ]
    const removeExpressions: string[] = []
    const expressionAttributeNames: Record<string, string> = {
      '#email': 'email',
      '#firstName': 'firstName',
      '#updatedAt': 'updatedAt'
    }
    const expressionAttributeValues: Record<string, string | number | boolean> = {
      ':email': email,
      ':firstName': firstName || 'Επισκέπτης',
      ':updatedAt': new Date().toISOString()
    }

    for (const [field, rule] of Object.entries(optional)) {
      const raw = body[field]
      if (raw === undefined) continue
      if (raw !== null && typeof raw !== 'string') {
        return NextResponse.json({ error: rule.error }, { status: 400 })
      }
      const value = (raw ?? '').trim()
      expressionAttributeNames[`#${field}`] = field
      if (!value) {
        removeExpressions.push(`#${field}`)
        continue
      }
      if (value.length > rule.max || (rule.pattern && !rule.pattern.test(value))) {
        return NextResponse.json({ error: rule.error }, { status: 400 })
      }
      setExpressions.push(`#${field} = :${field}`)
      expressionAttributeValues[`:${field}`] = value
    }

    // One account per email. Clients.EmailIndex is keyed on email, so this is a point
    // lookup; the owner keeping their own address is not a clash.
    const holders = await dynamoDB.send(new QueryCommand({
      TableName: TABLES.Clients,
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
      ProjectionExpression: 'id',
    }))
    if ((holders.Items ?? []).some((item) => item.id !== clientId)) {
      return NextResponse.json(
        { error: 'Το email χρησιμοποιείται ήδη από άλλον λογαριασμό.', code: 'EMAIL_EXISTS' },
        { status: 409 }
      )
    }

    let updateExpression = `SET ${setExpressions.join(', ')}`
    if (removeExpressions.length > 0) {
      updateExpression += ` REMOVE ${removeExpressions.join(', ')}`
    }

    let Attributes: Record<string, unknown> | undefined
    try {
      const result = await dynamoDB.send(new UpdateCommand({
        TableName: TABLES.Clients,
        Key: { id: clientId },
        UpdateExpression: updateExpression,
        // Without this an UpdateCommand on a deleted account quietly recreates a
        // half-empty row from a still-valid session.
        ConditionExpression: 'attribute_exists(id)',
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      }))
      Attributes = result.Attributes
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 })
      }
      throw error
    }

    if (!Attributes) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      message: 'Client updated successfully',
      client: presentClient(Attributes)
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
