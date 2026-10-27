import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, QueryCommand, TransactWriteCommand, type TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb'
import { ServiceRequestStatus } from '@/types/statuses'
import { hashPassword } from '@/utils/passwordService'
import { MIN_PASSWORD_LENGTH } from '@/utils/passwordPolicy'
import { logEvent } from '@/utils/eventLogger'
import { sendEmail } from '@/utils/emailService'
import { EventName, EmailTemplate } from '@/types/events'
import { getAuth } from '@/utils/requireAuth'
import { signToken, setAuthCookie } from '@/utils/auth'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'
import { broadcastNewRequest } from '@/utils/requestBroadcast'
import { getCategoryText } from '@/utils/categoryLabels'
import { estimateFor } from '@/app/api/price-estimation/estimate'
import { isValidEngineCC, normalizeEngineCC } from '@/app/api/vehicles/engineCC'
import { GUEST_PLACEHOLDER_NAME } from '@/app/api/auth/_lib/guestMerge'
import { randomUUID } from 'crypto'

// Same budget as /api/auth/register: this route registers guests inline, so
// without its own limit it was the unthrottled way to mint accounts.
const checkGuestSignupRate = createRateLimiter('service-request-signup', 5, 3600000)

const CURRENT_TERMS_VERSION = '1.0'

// The form never asks for engine details on these; the price lookup ignores them too.
const BODYWORK_CATEGORIES = new Set(['oliki-vafi', 'meriki-vafi', 'fanopeia'])
const FUEL_TYPES = new Set(['petrol', 'diesel', 'hybrid', 'electric', 'lpg', 'cng'])
const CATEGORY_PATTERN = /^[a-z0-9-]{2,40}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** Number-or-string inputs (the form sends strings, API callers sometimes numbers). */
const digits = (value: unknown): string =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : text(value)

/** The session's own row may still file a request: it exists, and it has not been folded into another account. */
const OWNER_CAN_FILE = 'attribute_exists(id) AND attribute_not_exists(mergedInto) AND attribute_not_exists(mergingInto)'

/**
 * Why the session's Clients row cannot take a new request, or null if it can. A JWT
 * outlives the account it names: a deleted account's, or a guest's since folded into a
 * real account (the row stays as a `mergedInto` tombstone) — or being folded right now
 * (`mergingInto`), when the merge has already listed the requests it moves and one filed
 * now would be left behind. Filing into any of them strands the request where nobody
 * can see it.
 */
function ownerRefusal(row: Record<string, unknown> | undefined): NextResponse | null {
  if (!row || row.mergedInto) {
    return NextResponse.json(
      { error: 'Η σύνδεσή σας έληξε. Συνδεθείτε ξανά για να στείλετε το αίτημα.' },
      { status: 401 }
    )
  }
  if (row.mergingInto) {
    return NextResponse.json(
      {
        error: 'Τα αιτήματά σας μεταφέρονται αυτή τη στιγμή στον λογαριασμό σας. Συνδεθείτε σε αυτόν και στείλτε ξανά το αίτημα.',
        code: 'MERGE_IN_PROGRESS',
      },
      { status: 409 }
    )
  }
  return null
}

const normalizeString = (value: unknown): string =>
  value === undefined || value === null ? '' : String(value).trim().toLowerCase()

/** The vehicle attributes a request carries, and that decide whether it is the same car. */
interface VehicleFields {
  brand: string
  model: string
  modelYear: string
  engineCC: string
  fuelType: string
  isAutomatic: boolean
  is4x4: boolean
  isTurbo: boolean
  vinNumber: string
  engineNumber: string
  licensePlate: string
  color: string
}

const VEHICLE_TEXT_FIELDS = [
  'brand', 'model', 'modelYear', 'engineCC', 'fuelType',
  'vinNumber', 'engineNumber', 'licensePlate', 'color',
] as const
const VEHICLE_FLAG_FIELDS = ['isAutomatic', 'is4x4', 'isTurbo'] as const
/** What the bodywork form never shows, so never the customer's edit there. */
const ENGINE_FIELDS = new Set(['engineCC', 'fuelType', 'isAutomatic', 'is4x4', 'isTurbo'])

/**
 * A saved vehicle is reused only when nothing about it changed. Booleans compare as
 * "is it true", because rows written before a flag existed simply lack it — an old car
 * with no `isTurbo` and a form that says "no turbo" are the same car. A bodywork
 * request leaves the engine out of it: those fields are not on its form.
 */
function areVehiclesSame(stored: Record<string, unknown>, current: VehicleFields, isBodywork: boolean): boolean {
  for (const field of VEHICLE_TEXT_FIELDS) {
    if (isBodywork && ENGINE_FIELDS.has(field)) continue
    const storedValue = field === 'engineCC' ? normalizeEngineCC(stored[field]) : stored[field]
    if (normalizeString(storedValue) !== normalizeString(current[field])) return false
  }
  for (const field of VEHICLE_FLAG_FIELDS) {
    if (isBodywork) continue
    if ((stored[field] === true) !== current[field]) return false
  }
  return true
}

/**
 * Brand and model are what make it the saved car. Anything else (year, engine, numbers)
 * is an edit of that car; another brand or model is another car that merely started
 * from it.
 */
function isSameModel(saved: Record<string, unknown>, vehicle: Pick<VehicleFields, 'brand' | 'model'>): boolean {
  return normalizeString(saved.brand) === normalizeString(vehicle.brand) &&
    normalizeString(saved.model) === normalizeString(vehicle.model)
}

/**
 * The request's vehicle with anything the body left out taken from the saved car. The
 * bodywork form never sends engine details, and no form sends the plate or colour; a
 * missing field means "as before", not "erase it".
 *
 * Except the fields that identify the saved car itself — plate, VIN, engine number,
 * colour — once the brand or model changed: they belong to the saved car, and used to
 * be copied onto a different one.
 */
function withSavedDefaults(body: Record<string, unknown>, saved: Record<string, unknown> | undefined): VehicleFields {
  const pick = (field: string): unknown => (body[field] === undefined ? saved?.[field] : body[field])
  const flag = (field: string): boolean => pick(field) === true
  const brand = text(pick('brand'))
  const model = text(pick('model'))
  const sameCar = !!saved && isSameModel(saved, { brand, model })
  const pickIdentity = (field: string): unknown => (sameCar ? pick(field) : body[field])
  return {
    brand,
    model,
    modelYear: digits(pick('modelYear')),
    engineCC: normalizeEngineCC(pick('engineCC')),
    fuelType: text(pick('fuelType')).toLowerCase(),
    isAutomatic: flag('isAutomatic'),
    is4x4: flag('is4x4'),
    isTurbo: flag('isTurbo'),
    vinNumber: text(pickIdentity('vinNumber')).toUpperCase(),
    engineNumber: text(pickIdentity('engineNumber')).toUpperCase(),
    licensePlate: text(pickIdentity('licensePlate')).toUpperCase(),
    color: text(pickIdentity('color')),
  }
}

/**
 * The bodywork form hides the engine fields, so what arrives in them is not the
 * customer's answer: a saved car's legacy "1600cc", a value typed under another
 * category. Refusing the request over it made such a car unusable for bodywork; an
 * unusable value is dropped instead.
 */
function withoutUnusableEngine(vehicle: VehicleFields): VehicleFields {
  return {
    ...vehicle,
    engineCC: isValidEngineCC(vehicle.engineCC) ? vehicle.engineCC : '',
    fuelType: FUEL_TYPES.has(vehicle.fuelType) ? vehicle.fuelType : '',
  }
}

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 })
}

/**
 * Everything the request needs, checked before anything is written. Returns the first
 * problem as a Greek sentence, or null. Length caps keep one row from carrying a novel.
 */
function validateVehicle(category: string, v: VehicleFields): string | null {
  const missing: string[] = []
  if (!category) missing.push('Κατηγορία')
  if (!v.brand) missing.push('Μάρκα')
  if (!v.model) missing.push('Μοντέλο')
  if (!v.modelYear) missing.push('Έτος')
  const isBodywork = BODYWORK_CATEGORIES.has(category)
  if (!isBodywork && !v.engineCC) missing.push('Κυβισμός')
  if (missing.length > 0) return `Λείπουν: ${missing.join(', ')}`

  if (!CATEGORY_PATTERN.test(category)) return 'Μη έγκυρη κατηγορία'
  if (v.brand.length > 60 || v.model.length > 60) return 'Η μάρκα και το μοντέλο έχουν όριο 60 χαρακτήρες'

  const year = Number(v.modelYear)
  if (!/^\d{4}$/.test(v.modelYear) || year < 1950 || year > new Date().getFullYear() + 1) {
    return 'Μη έγκυρο έτος μοντέλου'
  }
  // Not for bodywork, whose form never asks (see withoutUnusableEngine).
  if (!isBodywork) {
    if (v.engineCC && !isValidEngineCC(v.engineCC)) return 'Μη έγκυρος κυβισμός'
    if (v.fuelType && !FUEL_TYPES.has(v.fuelType)) return 'Μη έγκυρος τύπος καυσίμου'
  }
  if (v.vinNumber.length > 32 || v.engineNumber.length > 32) return 'Μη έγκυρος αριθμός πλαισίου ή κινητήρα'
  if (v.licensePlate.length > 20 || v.color.length > 40) return 'Μη έγκυρη πινακίδα ή χρώμα'
  return null
}

function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

/** Per-item cancellation codes of a cancelled transaction ('' where DynamoDB gave none). */
function cancellationCodes(error: unknown): string[] | null {
  if (!(error instanceof Error) || error.name !== 'TransactionCanceledException') return null
  const reasons = (error as Error & { CancellationReasons?: { Code?: string }[] }).CancellationReasons
  return (reasons ?? []).map((r) => r?.Code ?? '')
}

async function _POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return badRequest('Μη έγκυρο αίτημα')
    }

    // Identity comes from the JWT (set by the middleware) and from nowhere else.
    // This used to fall back to body.clientId, which the forms read out of
    // localStorage — so on a browser someone had left signed in, the next
    // person's request was filed into the previous person's account, silently
    // and without any cookie ever being presented. A caller without a valid
    // session is a guest, full stop, and registers like one below.
    const auth = getAuth(request)
    const existingClientId = auth?.userType === 'client' ? auth.userId : null

    // The session's own row must still be able to take the request (ownerRefusal).
    // Checked up front for a quick answer, and again inside the write itself, so a
    // merge that starts in between cannot slip past.
    if (existingClientId) {
      const owner = await dynamoDB.send(new GetCommand({
        TableName: 'Clients',
        Key: { id: existingClientId },
        ProjectionExpression: 'id, mergedInto, mergingInto',
        ConsistentRead: true,
      }))
      const refusal = ownerRefusal(owner.Item)
      if (refusal) return refusal
    }

    const category = text(body.category)
    const description = text(body.description)
    if (description.length > 2000) return badRequest('Η περιγραφή έχει όριο 2000 χαρακτήρες')

    // ── The saved vehicle, if the client picked one ─────────────────────────────
    // Only ever one of their own. The id and the "original" data both used to be
    // taken from the body, so passing someone else's vehicle id with matching
    // data filed the request against their car — VIN, plate and άδεια included.
    let savedVehicle: Record<string, unknown> | undefined
    const originalVehicleId = text(body.originalVehicleId)
    if (existingClientId && originalVehicleId) {
      const row = await dynamoDB.send(new GetCommand({ TableName: 'Vehicles', Key: { id: originalVehicleId } }))
      if (row.Item && row.Item.clientId === existingClientId) savedVehicle = row.Item
    }

    const isBodywork = BODYWORK_CATEGORIES.has(category)
    const asSent = withSavedDefaults(body, savedVehicle)
    const vehicle = isBodywork ? withoutUnusableEngine(asSent) : asSent
    const vehicleError = validateVehicle(category, vehicle)
    if (vehicleError) return badRequest(vehicleError)
    // The saved car's own name and άδεια carry over only while it is still that car.
    const continuesSavedCar = !!savedVehicle && isSameModel(savedVehicle, vehicle)

    // ── Guest registration: every check runs before the first write ─────────────
    // These used to run *after* the request and the vehicle had been stored, so a
    // guest bodywork submit with no credentials wrote both, returned 400, and the
    // ServiceRequests stream still emailed every active garage — on every retry.
    let newClient: Record<string, unknown> | null = null
    const clientId = existingClientId || `client-${randomUUID()}`
    if (!existingClientId) {
      const email = text(body.email).toLowerCase()
      const password = typeof body.password === 'string' ? body.password : ''
      if (!email || !password) return badRequest('Email και κωδικός είναι υποχρεωτικά')
      if (!EMAIL_PATTERN.test(email) || email.length > 254) return badRequest('Μη έγκυρη διεύθυνση email')
      if (password.length < MIN_PASSWORD_LENGTH || password.length > 200) {
        return badRequest(`Ο κωδικός πρέπει να έχει τουλάχιστον ${MIN_PASSWORD_LENGTH} χαρακτήρες`)
      }
      // Inline guest registration must record consent the same way the
      // dedicated /register route does — otherwise the user has an account
      // without proof of ToS acceptance.
      if (body.acceptedTerms !== true) {
        return badRequest('Πρέπει να αποδεχτείς τους Όρους Χρήσης και την Πολιτική Απορρήτου')
      }
      if (!checkGuestSignupRate(clientIp(request))) {
        return NextResponse.json({ error: 'Πολλές εγγραφές. Δοκιμάστε ξανά σε 1 ώρα.' }, { status: 429 })
      }

      // The form's live check fails open (a 429 or 500 there reads as "free"), so
      // this is the check that actually keeps one account per email.
      const existing = await dynamoDB.send(new QueryCommand({
        TableName: 'Clients',
        IndexName: 'EmailIndex',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': email },
        Limit: 1,
      }))
      if ((existing.Items?.length ?? 0) > 0) {
        return NextResponse.json(
          {
            error: 'Υπάρχει ήδη λογαριασμός με αυτό το email. Συνδέσου για να στείλεις το αίτημα.',
            code: 'EMAIL_EXISTS',
          },
          { status: 409 }
        )
      }

      const nowIso = new Date().toISOString()
      newClient = {
        id: clientId,
        // Never derived from the address, as /api/auth/register: the first name is
        // what garages see before they win the job, and the local part of an email
        // is most of the email.
        firstName: text(body.firstName).slice(0, 100) || GUEST_PLACEHOLDER_NAME,
        email,
        passwordHash: await hashPassword(password),
        isActive: true,
        acceptedTermsAt: nowIso,
        acceptedTermsVersion: CURRENT_TERMS_VERSION,
        createdAt: nowIso,
        updatedAt: nowIso,
      }
      const lastName = text(body.lastName).slice(0, 100)
      const phoneNumber = text(body.phoneNumber).slice(0, 30)
      const address = text(body.address).slice(0, 200)
      if (lastName) newClient.lastName = lastName
      if (phoneNumber) newClient.phoneNumber = phoneNumber
      if (address) newClient.address = address
    }

    // ── Which vehicle row the request points at ─────────────────────────────────
    let vehicleId: string
    let reuseVehicle = false
    if (savedVehicle) {
      reuseVehicle = areVehiclesSame(savedVehicle, vehicle, isBodywork)
      vehicleId = reuseVehicle ? (savedVehicle.id as string) : `vehicle-${randomUUID()}`
    } else if (existingClientId && (vehicle.vinNumber || vehicle.engineNumber)) {
      // Logged-in user typing a car they already have: match on VIN or engine number.
      // Vehicles.ClientVehiclesIndex is keyed on clientId, so this reads only their cars.
      const existingVehicles = await dynamoDB.send(new QueryCommand({
        TableName: 'Vehicles',
        IndexName: 'ClientVehiclesIndex',
        KeyConditionExpression: 'clientId = :clientId',
        ExpressionAttributeValues: { ':clientId': existingClientId },
      }))
      const matched = existingVehicles.Items?.find((v) =>
        (vehicle.vinNumber && normalizeString(v.vinNumber) === normalizeString(vehicle.vinNumber)) ||
        (vehicle.engineNumber && normalizeString(v.engineNumber) === normalizeString(vehicle.engineNumber))
      )
      reuseVehicle = !!matched
      vehicleId = matched ? (matched.id as string) : `vehicle-${randomUUID()}`
    } else {
      vehicleId = `vehicle-${randomUUID()}`
    }

    const nowIso = new Date().toISOString()
    let newVehicle: Record<string, unknown> | null = null
    if (!reuseVehicle) {
      newVehicle = {
        id: vehicleId,
        clientId,
        brand: vehicle.brand,
        model: vehicle.model,
        modelYear: vehicle.modelYear,
        fuelType: vehicle.fuelType || 'petrol',
        isAutomatic: vehicle.isAutomatic,
        is4x4: vehicle.is4x4,
        isTurbo: vehicle.isTurbo,
        isBrandOther: body.isBrandOther === true,
        isModelOther: body.isModelOther === true,
        isActive: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      }
      // Only add optional fields if they have values — empty strings break GSI keys
      if (vehicle.engineCC) newVehicle.engineCC = vehicle.engineCC
      if (vehicle.vinNumber) newVehicle.vinNumber = vehicle.vinNumber
      if (vehicle.engineNumber) newVehicle.engineNumber = vehicle.engineNumber
      if (vehicle.licensePlate) newVehicle.licensePlate = vehicle.licensePlate
      if (vehicle.color) newVehicle.color = vehicle.color
      // An edited saved car is a new row for the same car: it keeps the name and the
      // άδεια photo the customer already gave us rather than asking for them again.
      // A different brand or model is a different car, and gets neither.
      if (continuesSavedCar && savedVehicle?.nickname) newVehicle.nickname = savedVehicle.nickname
      if (continuesSavedCar && savedVehicle?.licensePhotoUrl) newVehicle.licensePhotoUrl = savedVehicle.licensePhotoUrl
    }

    // The estimate is the server's own lookup on the car being stored, never a figure
    // from the body — it is shown to garages next to the request.
    const estimation = estimateFor({ category, ...vehicle })

    // An idempotency key from the form makes a retried or double-fired submit land on
    // the same request id, which the condition below then refuses to write twice.
    const submissionId = text(body.submissionId)
    const serviceRequestId = UUID_PATTERN.test(submissionId)
      ? `sr-${submissionId.toLowerCase()}`
      : `sr-${randomUUID()}`

    const requestItem: Record<string, unknown> = {
      id: serviceRequestId,
      clientId,
      vehicleId,
      category,
      description,
      status: ServiceRequestStatus.PENDING,
      // Always empty here: photos are attached by /api/upload-photos once they are in
      // S3. Whatever the body claims is ignored — client-supplied keys would be
      // presigned for every garage, and junk entries counted against the photo cap.
      photoUrls: [],
      photos: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    }
    if (estimation) requestItem.estimatedCost = estimation.estimatedCost

    // One transaction, request last: the ServiceRequests stream emails every active
    // garage on INSERT, so the request must only exist once the account and the
    // vehicle it points at exist too — and never on a half-failed submit.
    const transactItems: NonNullable<TransactWriteCommandInput['TransactItems']> = []
    if (existingClientId) {
      // First item, so its cancellation code is codes[0] below.
      transactItems.push({
        ConditionCheck: { TableName: 'Clients', Key: { id: existingClientId }, ConditionExpression: OWNER_CAN_FILE },
      })
    }
    if (newClient) {
      transactItems.push({ Put: { TableName: 'Clients', Item: newClient, ConditionExpression: 'attribute_not_exists(id)' } })
    }
    if (newVehicle) {
      transactItems.push({ Put: { TableName: 'Vehicles', Item: newVehicle, ConditionExpression: 'attribute_not_exists(id)' } })
    }
    transactItems.push({ Put: { TableName: 'ServiceRequests', Item: requestItem, ConditionExpression: 'attribute_not_exists(id)' } })

    try {
      await dynamoDB.send(new TransactWriteCommand({ TransactItems: transactItems }))
    } catch (error) {
      const codes = cancellationCodes(error)
      if (!codes) throw error
      if (existingClientId && codes[0] === 'ConditionalCheckFailed') {
        const owner = await dynamoDB.send(new GetCommand({
          TableName: 'Clients',
          Key: { id: existingClientId },
          ConsistentRead: true,
        }))
        const refusal = ownerRefusal(owner.Item)
        if (refusal) return refusal
        throw error
      }
      // The request id is already stored (its condition failed), or an identical
      // submit is committing right now (TransactionConflict): a repeat, not a new
      // request. DynamoDB may omit the reasons, and then the re-read decides.
      const conflict = codes.includes('TransactionConflict')
      const idTaken = codes[transactItems.length - 1] === 'ConditionalCheckFailed'
      if (codes.length > 0 && !conflict && !idTaken) throw error

      // Hand the stored answer back to the client who owns it; anyone else (a
      // concurrent guest twin, a guessed id) just learns it was a duplicate.
      const prior = await dynamoDB.send(new GetCommand({
        TableName: 'ServiceRequests',
        Key: { id: serviceRequestId },
        ConsistentRead: true,
      }))
      if (prior.Item && existingClientId && prior.Item.clientId === existingClientId) {
        return NextResponse.json({
          success: true,
          duplicate: true,
          serviceRequestId,
          clientId: existingClientId,
          vehicleId: prior.Item.vehicleId,
          isNewAccount: false,
        })
      }
      if (!prior.Item && !conflict) throw error
      return NextResponse.json(
        { error: 'Το αίτημα έχει ήδη υποβληθεί.', code: 'DUPLICATE_SUBMISSION' },
        { status: 409 }
      )
    }

    logEvent({
      eventName: EventName.ServiceRequestSubmitted,
      actorType: 'client',
      actorId: clientId,
      clientId,
      requestId: serviceRequestId,
      source: 'api/service-request',
      metadata: {
        category,
        brand: vehicle.brand,
        model: vehicle.model,
        vehicleId,
        isGuest: !existingClientId
      }
    })

    // Confirmation email to the client. For guest registrations we have the
    // address straight from the body; for logged-in clients we'd need to look
    // it up — skip if we don't have it locally to avoid an extra DB hit.
    if (newClient) {
      sendEmail({
        to: newClient.email as string,
        templateName: EmailTemplate.RequestConfirmation,
        variables: {
          brand: vehicle.brand,
          model: vehicle.model,
          category: getCategoryText(category),
          clientId
        },
        triggerEvent: EventName.ServiceRequestSubmitted,
        clientId,
        requestId: serviceRequestId
      })
    }

    // Fan-out the new request to any garage dashboards listening on the
    // shared AppSync channel. Don't await — broadcasting must never block
    // the response, and failures are logged inside the helper.
    void broadcastNewRequest(serviceRequestId)

    const response = NextResponse.json({
      success: true,
      serviceRequestId,
      clientId,
      vehicleId,
      isNewAccount: !!newClient,
    })

    // Auto-login: set auth cookie when a new client was created
    if (newClient) {
      const token = await signToken({ userId: clientId, userType: 'client' })
      setAuthCookie(response, token)
    }

    return response

  } catch (error) {
    console.error('Error processing service request:', error)
    return NextResponse.json(
      {
        error: 'Σφάλμα κατά την επεξεργασία του αιτήματος',
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

export const POST = withMetrics(_POST)
