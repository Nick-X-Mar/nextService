import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { sendEmail } from '@/utils/emailService'
import { logEvent } from '@/utils/eventLogger'
import { getByIdOrNull } from '@/utils/getById'
import { resolveWinningGarageId } from '@/utils/garageClientView'
import { collectAll } from '@/utils/pagination'
import { getCategoryText } from '@/utils/categoryLabels'
import { EmailTemplate, EventName } from '@/types/events'
import { OfferStatus, ServiceRequestStatus } from '@/types/statuses'
import { TABLES } from '@/lib/tables'

type Row = Record<string, unknown>

/** What a client can change that a garage can see, as the email names it. */
const CHANGE_LABELS = {
  brand: 'Μάρκα',
  model: 'Μοντέλο',
  modelYear: 'Έτος',
  year: 'Έτος',
  engineCC: 'Κυβικά',
  fuelType: 'Καύσιμο',
  isAutomatic: 'Κιβώτιο',
  is4x4: '4x4',
  isTurbo: 'Turbo',
  vinNumber: 'Αριθμός πλαισίου',
  engineNumber: 'Αριθμός κινητήρα',
  color: 'Χρώμα',
  nickname: 'Όνομα οχήματος',
  licensePhoto: 'Φωτογραφία άδειας',
  photos: 'Φωτογραφίες',
  availability: 'Ημερομηνίες',
  firstName: 'Όνομα',
  licensePlate: 'Πινακίδα',
  lastName: 'Επώνυμο',
  phoneNumber: 'Κινητό',
  email: 'Email',
} as const

export type ChangedField = keyof typeof CHANGE_LABELS

/** See `garageClientView`: a garage is not told about what it may not see. */
const WINNER_ONLY = new Set<ChangedField>(['licensePlate', 'lastName', 'phoneNumber', 'email'])

const LIVE_STATES = new Set<string>([
  ServiceRequestStatus.PENDING,
  ServiceRequestStatus.APPOINTMENT,
  ServiceRequestStatus.IN_PROGRESS,
])

async function liveRequestsOf(clientId: string): Promise<Row[]> {
  const rows = await collectAll<Row>((startKey) => dynamoDB.send(new QueryCommand({
    TableName: TABLES.ServiceRequests,
    IndexName: 'ClientRequestsIndex',
    KeyConditionExpression: 'clientId = :clientId',
    ExpressionAttributeValues: { ':clientId': clientId },
    ExclusiveStartKey: startKey,
  })) as Promise<{ Items?: Row[]; LastEvaluatedKey?: Record<string, unknown> }>, 'requests to notify')
  return rows.filter((request) => LIVE_STATES.has(String(request.status)))
}

/**
 * The garages working on a request: the one that holds the job or, while it is
 * open, the ones with a live offer. Every active garage can open a pending
 * request, but one that has not quoted has nothing to revise, and mailing them
 * all on every edit would teach them to ignore these.
 */
async function garagesOn(request: Row): Promise<{ garageId: string; isWinner: boolean }[]> {
  const winner = await resolveWinningGarageId(request)
  if (winner) return [{ garageId: winner, isWinner: true }]
  if (request.status !== ServiceRequestStatus.PENDING) return []

  const offers = await collectAll<Row>((startKey) => dynamoDB.send(new QueryCommand({
    TableName: TABLES.Offers,
    IndexName: 'ServiceRequestOffersIndex',
    KeyConditionExpression: 'serviceRequestId = :requestId',
    ExpressionAttributeValues: { ':requestId': request.id },
    ProjectionExpression: 'garageId, #status',
    ExpressionAttributeNames: { '#status': 'status' },
    ExclusiveStartKey: startKey,
  })) as Promise<{ Items?: Row[]; LastEvaluatedKey?: Record<string, unknown> }>, 'offers to notify')

  return offers
    .filter((offer) => offer.status === OfferStatus.PENDING)
    .map((offer) => ({ garageId: String(offer.garageId), isWinner: false }))
}

async function notifyRequest(request: Row, fields: ChangedField[], onlyGarageId?: string) {
  const garages = (await garagesOn(request)).filter((g) => !onlyGarageId || g.garageId === onlyGarageId)
  if (garages.length === 0) return

  const vehicle = await getByIdOrNull(TABLES.Vehicles, request.vehicleId as string | undefined)
  const requestId = String(request.id)

  await Promise.all(garages.map(async ({ garageId, isWinner }) => {
    const visible = fields.filter((field) => isWinner || !WINNER_ONLY.has(field))
    if (visible.length === 0) return

    const garage = await getByIdOrNull(TABLES.Garages, garageId)
    const email = garage?.email as string | undefined
    // A pending or deactivated garage cannot open the page the email points to.
    if (!email || garage?.isActive !== true) return

    await sendEmail({
      to: email,
      templateName: EmailTemplate.RequestDetailsChanged,
      // Names only, never the values: an email outlives the job, and the page
      // the link opens applies the winner-only rule on every read.
      variables: {
        garageId,
        requestId,
        brand: String(vehicle?.brand ?? ''),
        model: String(vehicle?.model ?? ''),
        category: getCategoryText(String(request.category ?? '')),
        changes: [...new Set(visible.map((field) => CHANGE_LABELS[field]))].join(', '),
      },
      triggerEvent: EventName.RequestDetailsChanged,
      garageId,
      requestId,
    })
  }))

  await logEvent({
    eventName: EventName.RequestDetailsChanged,
    actorType: 'client',
    actorId: request.clientId as string,
    clientId: request.clientId as string,
    requestId,
    source: 'utils/requestChangeNotice',
    metadata: { fields, garageCount: garages.length },
  })
}

/**
 * Emails the garages working on a client's live requests that the client changed
 * something they can see, with a link to the request. Call it after the write,
 * and await it. Never rejects: a failed notice must not fail the client's edit.
 *
 * Which requests: `requestId` for a change to one request (and `onlyGarageId` for
 * one offer on it), `vehicleId` for a car, neither for the client's own details.
 */
export async function notifyGaragesOfChanges(
  clientId: string,
  fields: ChangedField[],
  { requestId, vehicleId, onlyGarageId }: { requestId?: string; vehicleId?: string; onlyGarageId?: string } = {}
): Promise<void> {
  if (fields.length === 0) return
  try {
    const requests = (await liveRequestsOf(clientId)).filter(
      (request) => (!requestId || request.id === requestId) && (!vehicleId || request.vehicleId === vehicleId)
    )
    await Promise.all(requests.map((request) => notifyRequest(request, fields, onlyGarageId)))
  } catch (err) {
    console.error('[requestChangeNotice] failed:', err)
  }
}
