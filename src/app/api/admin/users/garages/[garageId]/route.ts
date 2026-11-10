import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { DEFAULT_COMMISSION_PERCENT, garageCommissionPercent, parseCommissionPercent } from '@/lib/commission-basis'
import { EventName } from '@/types/events'
import { logEvent } from '@/utils/eventLogger'
import { garageLedger } from '@/utils/garageLedger'
import { queryIndexOrScan } from '@/utils/indexQuery'
import { withMetrics } from '@/utils/withMetrics'
import { TABLES } from '@/lib/tables'
import { businessTypes } from '@/types/businessTypes'

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Everything the admin sees of a garage. Never a raw row: it holds the password hash. */
async function _GET(
  _request: NextRequest,
  { params }: { params: Promise<{ garageId: string }> }
) {
  try {
    const { garageId } = await params

    const [garageResult, offersResult, ledger] = await Promise.all([
      dynamoDB.send(new GetCommand({
        TableName: TABLES.Garages,
        Key: { id: garageId }
      })),
      dynamoDB.send(new QueryCommand({
        TableName: TABLES.Offers,
        IndexName: 'GarageOffersIndex',
        KeyConditionExpression: 'garageId = :garageId',
        ExpressionAttributeValues: { ':garageId': garageId },
        Select: 'COUNT'
      })),
      garageLedger(garageId),
    ])

    const garage = garageResult.Item
    if (!garage) {
      return NextResponse.json({ error: 'Garage not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: garage.id,
      type: 'garage',
      email: garage.email,
      name: garage.companyName || garage.email,
      companyName: str(garage.companyName),
      contactFirstName: str(garage.contactFirstName),
      contactLastName: str(garage.contactLastName),
      phone: garage.mobile || '',
      tin: garage.tin || '',
      taxAuthority: str(garage.taxAuthority),
      address: garage.address || '',
      area: str(garage.area),
      municipality: str(garage.municipality),
      businessTypes: businessTypes(garage.businessTypes),
      description: str(garage.description),
      benefits: garage.benefits || [],
      workdayStartTime: str(garage.workdayStartTime),
      workdayEndTime: str(garage.workdayEndTime),
      createdAt: garage.createdAt || '',
      activatedAt: str(garage.activatedAt),
      deactivatedAt: str(garage.deactivatedAt),
      isActive: garage.isActive ?? false,
      offerCount: offersResult.Count || 0,
      rate: {
        commissionPercent: garageCommissionPercent(garage),
        hasCustomRate: parseCommissionPercent(garage.commissionPercent) !== null,
        defaultCommissionPercent: DEFAULT_COMMISSION_PERCENT,
        ...(garage.commissionPercentSetAt ? { rateSetAt: garage.commissionPercentSetAt } : {}),
        ...(garage.commissionPercentSetBy ? { rateSetBy: garage.commissionPercentSetBy } : {}),
      },
      ledger,
    })
  } catch (error) {
    console.error('Admin garage detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch garage' }, { status: 500 })
  }
}

const EDITABLE = [
  'companyName', 'contactFirstName', 'contactLastName', 'email', 'mobile',
  'tin', 'taxAuthority', 'address', 'area', 'municipality', 'description',
] as const

/**
 * PUT /api/admin/users/garages/[garageId] — the admin corrects a garage's details,
 * by the same rules a garage's own save goes by. Activation and the commission
 * rate have routes of their own, and the password stays with the garage.
 */
async function _PUT(
  request: NextRequest,
  { params }: { params: Promise<{ garageId: string }> }
) {
  try {
    const { garageId } = await params
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Μη έγκυρα στοιχεία' }, { status: 400 })
    }

    const values = Object.fromEntries(
      EDITABLE.map((field) => [field, str((body as Record<string, unknown>)[field]).trim().slice(0, 500)])
    ) as Record<(typeof EDITABLE)[number], string>
    values.email = values.email.toLowerCase()
    values.mobile = values.mobile.replace(/\s/g, '')
    const types = businessTypes((body as Record<string, unknown>).businessTypes)

    if (!values.companyName) return NextResponse.json({ error: 'Η επωνυμία είναι υποχρεωτική' }, { status: 400 })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      return NextResponse.json({ error: 'Μη έγκυρη διεύθυνση email' }, { status: 400 })
    }
    if (!/^\d{9}$/.test(values.tin)) return NextResponse.json({ error: 'Ο ΑΦΜ πρέπει να είναι 9 ψηφία' }, { status: 400 })
    if (!/^(\+30|0)?[0-9]{10}$/.test(values.mobile)) {
      return NextResponse.json({ error: 'Μη έγκυρος αριθμός κινητού' }, { status: 400 })
    }

    const [emailOwners, tinOwners] = await Promise.all([
      queryIndexOrScan<{ id: string }>({
        table: TABLES.Garages,
        indexName: 'EmailIndex',
        keyConditionExpression: 'email = :email',
        scanFilterExpression: 'email = :email',
        expressionAttributeValues: { ':email': values.email },
      }),
      queryIndexOrScan<{ id: string }>({
        table: TABLES.Garages,
        indexName: 'TINIndex',
        keyConditionExpression: 'tin = :tin',
        scanFilterExpression: 'tin = :tin',
        expressionAttributeValues: { ':tin': values.tin },
      }),
    ])
    if (emailOwners.some((g) => g.id !== garageId)) {
      return NextResponse.json({ error: 'Το email χρησιμοποιείται ήδη από άλλο συνεργείο.' }, { status: 409 })
    }
    if (tinOwners.some((g) => g.id !== garageId)) {
      return NextResponse.json({ error: 'Ο ΑΦΜ χρησιμοποιείται ήδη από άλλο συνεργείο.' }, { status: 409 })
    }

    try {
      await dynamoDB.send(new UpdateCommand({
        TableName: TABLES.Garages,
        Key: { id: garageId },
        UpdateExpression: `SET ${EDITABLE.map((field) => `${field} = :${field}`).join(', ')}, businessTypes = :businessTypes, updatedAt = :now`,
        // Without the condition an unknown id would create a bare garage row. A
        // closed account is anonymized for good.
        ConditionExpression: 'attribute_exists(id) AND attribute_not_exists(anonymizedAt)',
        ExpressionAttributeValues: {
          ...Object.fromEntries(EDITABLE.map((field) => [`:${field}`, values[field]])),
          ':businessTypes': types,
          ':now': new Date().toISOString(),
        },
      }))
    } catch (err) {
      if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
        return NextResponse.json({ error: 'Το συνεργείο δεν βρέθηκε' }, { status: 404 })
      }
      throw err
    }

    await logEvent({
      eventName: EventName.GarageEditedByAdmin,
      actorType: 'admin',
      actorId: request.headers.get('x-admin-id') || 'admin',
      garageId,
      source: 'admin/garages',
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin garage edit error:', error)
    return NextResponse.json({ error: 'Failed to update garage' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
export const PUT = withMetrics(_PUT)
