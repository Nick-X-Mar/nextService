import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { ServiceRequestStatus } from '@/types/statuses'
import type { AdminRequestList, AdminRequestRow, WaitingOn } from '@/types/adminRequests'
import { batchGetById } from '@/utils/batchGetById'
import { collectAll } from '@/utils/pagination'
import { messageThread, requestWaiting, type WaitingMessage, type WaitingOffer, type WaitingRequest } from '@/utils/requestWaiting'
import { foldText } from '@/utils/searchText'
import { withMetrics } from '@/utils/withMetrics'
import { TABLES } from '@/lib/tables'

const MAX_PAGE_SIZE = 100
const DEFAULT_PAGE_SIZE = 25

const WON_STATUSES: string[] = [
  ServiceRequestStatus.APPOINTMENT,
  ServiceRequestStatus.IN_PROGRESS,
  ServiceRequestStatus.COMPLETED,
]

function clientName(client: Record<string, unknown> | undefined): string {
  if (!client) return 'Unknown'
  return [client.firstName, client.lastName].filter(Boolean).join(' ')
    || String(client.email || client.phoneNumber || 'Guest')
}

/**
 * The admin's request list. Filtering spans the joined client and vehicle, which
 * DynamoDB cannot do, so every request in the date range is read and joined here
 * and the filters, the counts and the page are all taken from that one result.
 * That is why the counts always agree with the rows. The tables are small enough
 * for an admin screen; a cursor per filter could not give it a total or page numbers.
 */
async function _GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const status = searchParams.get('status') || ''
    const category = searchParams.get('category') || ''
    const clientId = searchParams.get('clientId') || ''
    const offers = searchParams.get('offers') || ''
    const waitingOn = searchParams.get('waiting') || ''
    const oldestFirst = searchParams.get('sort') === 'oldest'
    const query = foldText(searchParams.get('q')?.trim() || '')
    const digits = query.replace(/\D/g, '')
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '', 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)

    const fromISO = from ? (from.includes('T') ? from : `${from}T00:00:00.000Z`) : undefined
    const toISO = to ? (to.includes('T') ? to : `${to}T23:59:59.999Z`) : undefined
    const dateFilters = [
      ...(fromISO ? ['createdAt >= :from'] : []),
      ...(toISO ? ['createdAt <= :to'] : []),
    ]

    const [requests, offerRows, messageRows, declineRows] = await Promise.all([
      collectAll<Record<string, string>>((startKey) => dynamoDB.send(new ScanCommand({
        TableName: TABLES.ServiceRequests,
        ProjectionExpression: 'id, clientId, vehicleId, category, serviceCategory, #status, createdAt, acceptedOfferId, acceptedGarageId, appointmentDate, appointmentTime, completedAt, completionOutcome, outcomeReview, clientConfirmation',
        ExpressionAttributeNames: { '#status': 'status' },
        ...(dateFilters.length > 0 ? {
          FilterExpression: dateFilters.join(' AND '),
          ExpressionAttributeValues: {
            ...(fromISO ? { ':from': fromISO } : {}),
            ...(toISO ? { ':to': toISO } : {}),
          },
        } : {}),
        ExclusiveStartKey: startKey,
      })) as Promise<{ Items?: Record<string, string>[]; LastEvaluatedKey?: Record<string, unknown> }>, 'admin requests'),
      collectAll<Record<string, string>>((startKey) => dynamoDB.send(new ScanCommand({
        TableName: TABLES.Offers,
        ProjectionExpression: 'serviceRequestId, garageId, #status, createdAt, availabilityDates, clientAvailabilityDates, clientAvailabilityProposedAt',
        ExpressionAttributeNames: { '#status': 'status' },
        ExclusiveStartKey: startKey,
      })) as Promise<{ Items?: Record<string, string>[]; LastEvaluatedKey?: Record<string, unknown> }>, 'admin request offers'),
      collectAll<Record<string, string>>((startKey) => dynamoDB.send(new ScanCommand({
        TableName: TABLES.ChatMessages,
        ProjectionExpression: 'requestId, senderType, senderId, garageId, #timestamp',
        ExpressionAttributeNames: { '#timestamp': 'timestamp' },
        ExclusiveStartKey: startKey,
      })) as Promise<{ Items?: Record<string, string>[]; LastEvaluatedKey?: Record<string, unknown> }>, 'admin request messages'),
      collectAll<Record<string, string>>((startKey) => dynamoDB.send(new ScanCommand({
        TableName: TABLES.RequestDeclines,
        ProjectionExpression: 'requestId',
        ExclusiveStartKey: startKey,
      })) as Promise<{ Items?: Record<string, string>[]; LastEvaluatedKey?: Record<string, unknown> }>, 'admin request declines'),
    ])

    const countBy = (rows: Record<string, string>[], key: string) => {
      const counts = new Map<string, number>()
      for (const row of rows) counts.set(row[key], (counts.get(row[key]) ?? 0) + 1)
      return counts
    }
    const offerCounts = countBy(offerRows, 'serviceRequestId')
    const messageCounts = countBy(messageRows, 'requestId')
    const declineCounts = countBy(declineRows, 'requestId')

    const groupBy = <T extends Record<string, string>>(rows: T[], key: string) => {
      const groups = new Map<string, T[]>()
      for (const row of rows) groups.set(row[key], [...(groups.get(row[key]) ?? []), row])
      return groups
    }
    const offersByRequest = groupBy(offerRows, 'serviceRequestId')
    const messagesByRequest = groupBy(messageRows, 'requestId')

    const [clients, vehicles, garages] = await Promise.all([
      batchGetById(TABLES.Clients, requests.map((r) => r.clientId), {
        projection: 'id, firstName, lastName, email, phoneNumber',
      }),
      batchGetById(TABLES.Vehicles, requests.map((r) => r.vehicleId), {
        projection: 'id, brand, model, modelYear, licensePlate',
      }),
      batchGetById(TABLES.Garages, [
        ...requests.map((r) => r.acceptedGarageId),
        ...offerRows.map((o) => o.garageId),
        ...(messageRows as WaitingMessage[]).map(messageThread),
      ], {
        projection: 'id, companyName, mobile',
      }),
    ])

    const rows = requests.map((r) => {
      const client = clients.get(r.clientId)
      const vehicle = vehicles.get(r.vehicleId)
      const row: AdminRequestRow & { accepted: boolean; search: string } = {
        id: r.id,
        createdAt: r.createdAt,
        status: r.status,
        category: r.serviceCategory || r.category || '-',
        client: r.clientId ? {
          id: r.clientId,
          name: clientName(client),
          phone: String(client?.phoneNumber ?? ''),
          email: String(client?.email ?? ''),
        } : null,
        vehicle: vehicle ? {
          label: [vehicle.brand, vehicle.model, vehicle.modelYear].filter(Boolean).join(' '),
          plate: String(vehicle.licensePlate ?? ''),
        } : null,
        offerCount: offerCounts.get(r.id) ?? 0,
        messageCount: messageCounts.get(r.id) ?? 0,
        declineCount: declineCounts.get(r.id) ?? 0,
        garageName: r.acceptedGarageId ? String(garages.get(r.acceptedGarageId)?.companyName ?? r.acceptedGarageId) : null,
        appointmentDate: r.appointmentDate ?? null,
        appointmentTime: r.appointmentTime ?? null,
        waiting: requestWaiting(
          r as WaitingRequest,
          (offersByRequest.get(r.id) ?? []) as unknown as WaitingOffer[],
          (messagesByRequest.get(r.id) ?? []) as WaitingMessage[],
          garages
        ),
        accepted: Boolean(r.acceptedOfferId) || WON_STATUSES.includes(r.status),
        search: foldText([
          clientName(client), client?.email, client?.phoneNumber,
          vehicle?.brand, vehicle?.model, vehicle?.modelYear, vehicle?.licensePlate, r.id,
        ].filter(Boolean).join(' ')),
      }
      return row
    })

    const categoryCounts = new Map<string, number>()
    for (const row of rows) categoryCounts.set(row.category, (categoryCounts.get(row.category) ?? 0) + 1)

    const scoped = rows.filter((row) => {
      if (category && row.category !== category) return false
      if (clientId && row.client?.id !== clientId) return false
      if (offers === 'none' && row.offerCount > 0) return false
      if (offers === 'some' && row.offerCount === 0) return false
      if (query) {
        const matched = row.search.includes(query)
          || (digits.length >= 3 && row.search.replace(/\D/g, '').includes(digits))
        if (!matched) return false
      }
      return true
    })

    // Each set of tiles keeps its numbers under its own filter, and follows the other.
    const byWaiting: Record<WaitingOn, number> = { client: 0, garage: 0, admin: 0 }
    for (const row of scoped.filter((r) => !status || r.status === status)) {
      for (const on of new Set(row.waiting.map((w) => w.on))) byWaiting[on]++
    }

    const counted = waitingOn ? scoped.filter((row) => row.waiting.some((w) => w.on === waitingOn)) : scoped

    const byStatus: Record<string, number> = {}
    for (const value of Object.values(ServiceRequestStatus)) byStatus[value] = 0
    for (const row of counted) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1

    const matching = (status ? counted.filter((row) => row.status === status) : counted)
      .sort((a, b) => (oldestFirst ? 1 : -1) * (a.createdAt || '').localeCompare(b.createdAt || ''))

    const lastPage = Math.max(1, Math.ceil(matching.length / pageSize))
    const page = Math.min(Math.max(parseInt(searchParams.get('page') || '', 10) || 1, 1), lastPage)

    const items = matching
      .slice((page - 1) * pageSize, page * pageSize)
      .map(({ accepted: _accepted, search: _search, ...row }) => row)

    const filteredClient = clientId ? rows.find((row) => row.client?.id === clientId)?.client : null

    const body: AdminRequestList = {
      items,
      total: matching.length,
      page,
      pageSize,
      byStatus,
      byWaiting,
      funnel: {
        created: counted.length,
        offered: counted.filter((row) => row.offerCount > 0).length,
        accepted: counted.filter((row) => row.accepted).length,
        completed: byStatus[ServiceRequestStatus.COMPLETED] ?? 0,
      },
      pendingNoOffers: counted.filter((row) => row.status === ServiceRequestStatus.PENDING && row.offerCount === 0).length,
      categories: [...categoryCounts].map(([value, count]) => ({ value, count })),
      client: filteredClient ? { id: filteredClient.id, name: filteredClient.name } : null,
    }

    return NextResponse.json(body)
  } catch (error) {
    console.error('Request list error:', error)
    return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
