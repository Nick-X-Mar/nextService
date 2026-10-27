import { getByIdOrNull } from '@/utils/getById'
import { ServiceRequestStatus } from '@/types/statuses'
import { GUEST_PLACEHOLDER_NAME } from '@/app/api/auth/_lib/guestMerge'

/**
 * What a garage may see of a client and their car.
 *
 * Client PII is winner-only. While a request is on the open market every active
 * garage gets what it needs to quote — the car, the job, the photos and the
 * client's first name — and talks to the client through the in-app chat. Only
 * the garage whose offer was accepted, and only from the acceptance on, gets
 * the surname, phone, email, plate, VIN, engine number and άδεια. A garage that
 * lost, or whose job was cancelled, keeps the quoting view of its own history.
 *
 * Every garage-facing response that carries a client or a vehicle goes through
 * these two functions, so the rule lives in one place.
 */

/** The states in which the accepted garage still holds the job. CANCELLED is not one. */
const WON_STATES = new Set<string>([
  ServiceRequestStatus.APPOINTMENT,
  ServiceRequestStatus.IN_PROGRESS,
  ServiceRequestStatus.COMPLETED,
])

type Row = Record<string, unknown>

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined

/**
 * Whether `garageId` won this request and still holds it.
 *
 * `legacyWinnerId` is for rows booked before `acceptedGarageId` existed, which
 * carry only `acceptedOfferId`: the caller resolves that offer's garage (see
 * `resolveWinningGarageId`) or passes undefined when the row has the field.
 */
export function isWinningGarage(
  serviceRequest: Row,
  garageId: string,
  legacyWinnerId?: string | null
): boolean {
  if (!WON_STATES.has(String(serviceRequest.status))) return false
  const winner = str(serviceRequest.acceptedGarageId) ?? legacyWinnerId
  return !!winner && winner === garageId
}

/**
 * The winning garage of a request, reading the accepted offer only for the old
 * rows that lack `acceptedGarageId`. Null while nobody holds the job.
 */
export async function resolveWinningGarageId(serviceRequest: Row): Promise<string | null> {
  if (!WON_STATES.has(String(serviceRequest.status))) return null
  const direct = str(serviceRequest.acceptedGarageId)
  if (direct) return direct
  const offer = await getByIdOrNull('Offers', str(serviceRequest.acceptedOfferId))
  return str(offer?.garageId) ?? null
}

/**
 * The client's first name as a garage that has not won may see it.
 *
 * Accounts made from the request form or the plain register route have no name
 * of their own: they are stored with the email's local part as `firstName`
 * ("maria.papadopoulou84"), which is the email in all but the domain. That is
 * not a first name and is never shown. A full name typed into the first-name
 * field is cut to its first word.
 */
export function quotingFirstName(client: Row): string | undefined {
  return realFirstName(client)?.split(/\s+/)[0]
}

/**
 * `firstName` when it is a name: not the placeholder nameless accounts get
 * («Επισκέπτης»), not the email's local part older accounts were given. The
 * winner sees it in full; everyone else through `quotingFirstName`.
 */
function realFirstName(client: Row): string | undefined {
  const first = str(client.firstName)
  if (!first || first === GUEST_PLACEHOLDER_NAME) return undefined
  const local = str(client.email)?.split('@')[0]
  if (local && first.toLowerCase() === local.toLowerCase()) return undefined
  return first
}

export interface GarageClientView {
  /** Absent when the account has no real first name; the UI says «Πελάτης». */
  firstName?: string
  lastName?: string
  phoneNumber?: string
  email?: string
}

export function garageClientView(client: Row | null | undefined, isWinner: boolean): GarageClientView | null {
  if (!client) return null
  if (!isWinner) {
    const firstName = quotingFirstName(client)
    return firstName ? { firstName } : {}
  }
  return {
    // The winner sees «Πελάτης» for a nameless account too, not «Επισκέπτης».
    firstName: realFirstName(client),
    lastName: str(client.lastName),
    phoneNumber: str(client.phoneNumber),
    email: str(client.email),
  }
}

/** The vehicle fields a quote needs — none of them identify the car or its owner. */
export function garageVehicleView(vehicle: Row | null | undefined, isWinner: boolean) {
  if (!vehicle) return null
  const quoting = {
    brand: vehicle.brand as string | undefined,
    model: vehicle.model as string | undefined,
    year: vehicle.year as string | number | undefined,
    modelYear: vehicle.modelYear as string | undefined,
    engineCC: vehicle.engineCC as string | undefined,
    fuelType: vehicle.fuelType as string | undefined,
    isAutomatic: vehicle.isAutomatic as boolean | undefined,
    is4x4: vehicle.is4x4 as boolean | undefined,
    isTurbo: vehicle.isTurbo as boolean | undefined,
  }
  if (!isWinner) return quoting
  return {
    ...quoting,
    licensePlate: str(vehicle.licensePlate),
    vinNumber: str(vehicle.vinNumber),
    engineNumber: str(vehicle.engineNumber),
  }
}

/** DynamoDB projections for the reads behind the quoting view — the rest is never loaded. */
export const QUOTING_CLIENT_PROJECTION = 'id, firstName, email'
export const QUOTING_VEHICLE_PROJECTION =
  'id, brand, #model, #year, modelYear, engineCC, fuelType, isAutomatic, is4x4, isTurbo'
export const QUOTING_VEHICLE_NAMES = { '#model': 'model', '#year': 'year' }
