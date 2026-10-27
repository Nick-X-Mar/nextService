import { NextRequest, NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'
import { DeleteCommand, GetCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { getAuth } from '@/utils/requireAuth'
import { REVIEWS_TABLE_NAME } from '@/utils/ensureReviewsTable'

/**
 * A "guest" is a Clients row with no credentials at all — no email, no
 * password. The service-request funnel created those until April 2026, when
 * inline registration became mandatory; the rows (and their requests) are still
 * there. A guest can only ever act through a session already issued for its
 * own row, so the session is the only proof of identity this flow accepts.
 *
 * Once folded into a real account the row is kept as a tombstone
 * (`mergedInto`, `mergedAt`) rather than deleted, so a tab still holding the
 * guest session can learn what happened to it.
 */

const CLIENTS = 'Clients'
const WALLET_TRANSACTIONS = process.env.WALLET_TRANSACTIONS_TABLE || 'WalletTransactions'

/** The first name the old funnel gave every guest it created (shared with the UI). */
export { GUEST_PLACEHOLDER_NAME } from '@/types/clients'

/** Still a guest: not registered, not merged. Every write in this flow is conditioned on it. */
export const GUEST_CONDITION =
  'attribute_exists(id) AND attribute_not_exists(email) AND attribute_not_exists(passwordHash) AND attribute_not_exists(mergedInto)'

/** Server-only attributes of a pending merge. `/api/auth/me` must never return these. */
export const PENDING_MERGE_FIELDS = [
  'mergeTokenHash',
  'mergeTargetId',
  'mergeEmail',
  'mergeExpiresAt',
  'mergeRequestedAt',
  'mergeConfirmedAt',
  'mergingInto',
  'mergeClaimedAt',
] as const

export const MERGE_TOKEN_TTL_MS = 60 * 60 * 1000

/**
 * How long a link that was opened in time may be opened again to finish a
 * merge that broke off halfway. Without a ceiling, a confirmed link stayed a
 * live credential for the account forever.
 */
export const MERGE_RETRY_CEILING_MS = 24 * 60 * 60 * 1000

/**
 * A claim older than this belongs to a merge that died: none runs anywhere
 * near this long (an SSR invocation is cut off far sooner). Until then the
 * merge is treated as running; after it, a fresh link may be requested to
 * finish the job.
 */
export const MERGE_CLAIM_STALE_MS = 5 * 60 * 1000

/** A merge into `mergingInto` started recently enough to still be running. */
export function mergeClaimIsFresh(row: Record<string, unknown>, now = Date.now()): boolean {
  if (!row.mergingInto) return false
  const claimedAt = Date.parse(String(row.mergeClaimedAt ?? ''))
  return Number.isFinite(claimedAt) && claimedAt > now - MERGE_CLAIM_STALE_MS
}

/** Whether the pending link can still be spent: unopened and unexpired, or opened within the ceiling. */
export function mergeLinkIsUsable(row: Record<string, unknown>, now = Date.now()): boolean {
  const confirmedAt = Date.parse(String(row.mergeConfirmedAt ?? ''))
  if (Number.isFinite(confirmedAt)) return confirmedAt > now - MERGE_RETRY_CEILING_MS
  return Date.parse(String(row.mergeExpiresAt ?? '')) > now
}

export type GuestRow = Record<string, unknown> & { id: string }

export function isGuestRow(row: Record<string, unknown> | undefined): boolean {
  return !!row && !row.email && !row.passwordHash && !row.mergedInto
}

export function hashMergeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Constant-time comparison of a presented token against the stored hash. */
export function mergeTokenMatches(token: string, storedHash: unknown): boolean {
  if (typeof storedHash !== 'string' || storedHash.length !== 64) return false
  const presented = Buffer.from(hashMergeToken(token), 'hex')
  const stored = Buffer.from(storedHash, 'hex')
  return presented.length === stored.length && timingSafeEqual(presented, stored)
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

export function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

export function isConditionalCheckFailed(err: unknown): boolean {
  return err instanceof Error && err.name === 'ConditionalCheckFailedException'
}

export async function getClient(id: string): Promise<Record<string, unknown> | undefined> {
  const res = await dynamoDB.send(new GetCommand({ TableName: CLIENTS, Key: { id }, ConsistentRead: true }))
  return res.Item
}

export async function findClientByEmail(email: string): Promise<Record<string, unknown> | undefined> {
  const res = await dynamoDB.send(
    new QueryCommand({
      TableName: CLIENTS,
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
      Limit: 1,
    })
  )
  return res.Items?.[0]
}

/** The account fields the client app is allowed to see. */
export function publicClient(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    firstName: row.firstName as string | undefined,
    lastName: row.lastName as string | undefined,
    email: row.email as string | undefined,
    phoneNumber: row.phoneNumber as string | undefined,
  }
}

/**
 * Resolves the caller to the guest row it is signed in as.
 *
 * Identity comes from the session and nowhere else. A body `guestClientId` is
 * tolerated for old tabs but must name the caller's own row — it used to be
 * the *only* identity this flow had, which let anyone name any row.
 */
export async function requireGuestSession(
  request: NextRequest,
  claimedGuestId?: unknown
): Promise<{ guestId: string; guest: GuestRow } | NextResponse> {
  const auth = getAuth(request)
  if (!auth || auth.userType !== 'client') {
    return NextResponse.json({ error: 'Απαιτείται σύνδεση' }, { status: 401 })
  }
  if (claimedGuestId !== undefined && claimedGuestId !== auth.userId) {
    return NextResponse.json({ error: 'Δεν έχετε πρόσβαση σε αυτόν τον λογαριασμό' }, { status: 403 })
  }

  const guest = await getClient(auth.userId)
  if (!guest) {
    return NextResponse.json({ error: 'Ο λογαριασμός δεν βρέθηκε' }, { status: 404 })
  }
  if (guest.mergedInto) {
    return NextResponse.json(
      {
        code: 'ALREADY_MERGED',
        error: 'Τα αιτήματα αυτά έχουν ήδη συνδεθεί με λογαριασμό. Συνδεθείτε για να τα δείτε.',
      },
      { status: 409 }
    )
  }
  if (!isGuestRow(guest)) {
    return NextResponse.json(
      { code: 'NOT_GUEST', error: 'Ο λογαριασμός σας είναι ήδη εγγεγραμμένος.' },
      { status: 409 }
    )
  }
  return { guestId: auth.userId, guest: guest as GuestRow }
}

/**
 * Reserves the guest for one target account before anything moves.
 *
 * Without this a password merge into one account and an email confirmation for
 * another could interleave and split the guest's requests between the two.
 * Re-claiming for the same account is allowed, so a merge interrupted halfway
 * can be finished by simply trying again. `mergeClaimedAt` records the latest
 * attempt, which is how a running merge is told apart from a dead one.
 */
export async function claimGuestForMerge(
  guestId: string,
  accountId: string,
  extra: { condition?: string; values?: Record<string, unknown>; set?: string } = {}
): Promise<boolean> {
  try {
    await dynamoDB.send(
      new UpdateCommand({
        TableName: CLIENTS,
        Key: { id: guestId },
        UpdateExpression: `SET mergingInto = :acct, mergeClaimedAt = :claimedAt${extra.set ? `, ${extra.set}` : ''}`,
        ConditionExpression: `${GUEST_CONDITION} AND (attribute_not_exists(mergingInto) OR mergingInto = :acct)${
          extra.condition ? ` AND ${extra.condition}` : ''
        }`,
        ExpressionAttributeValues: {
          ':acct': accountId,
          ':claimedAt': new Date().toISOString(),
          ...(extra.values ?? {}),
        },
      })
    )
    return true
  } catch (err) {
    if (isConditionalCheckFailed(err)) return false
    throw err
  }
}

/**
 * Turns the claimed guest into a tombstone. Returns false only when the row
 * ended up somewhere other than `accountId` — a concurrent finish of the same
 * merge counts as success.
 */
export async function finalizeGuestMerge(guestId: string, accountId: string): Promise<boolean> {
  const now = new Date().toISOString()
  try {
    await dynamoDB.send(
      new UpdateCommand({
        TableName: CLIENTS,
        Key: { id: guestId },
        UpdateExpression: `SET mergedInto = :acct, mergedAt = :now, updatedAt = :now REMOVE ${PENDING_MERGE_FIELDS.join(', ')}`,
        ConditionExpression: 'mergingInto = :acct AND attribute_not_exists(mergedInto)',
        ExpressionAttributeValues: { ':acct': accountId, ':now': now },
      })
    )
    return true
  } catch (err) {
    if (!isConditionalCheckFailed(err)) throw err
    const row = await getClient(guestId)
    return row?.mergedInto === accountId
  }
}

interface VehicleIdentifier {
  vinNumber?: string
  engineNumber?: string
}

// Same car only when VIN or engine number agree — brand/model alone says nothing.
function areVehiclesSame(a: VehicleIdentifier, b: VehicleIdentifier): boolean {
  const same = (x?: string, y?: string) => !!x && !!y && x.trim().toLowerCase() === y.trim().toLowerCase()
  return same(a.vinNumber, b.vinNumber) || same(a.engineNumber, b.engineNumber)
}

async function queryAll(table: string, index: string, clientId: string): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = []
  let ExclusiveStartKey: Record<string, unknown> | undefined
  do {
    const res = await dynamoDB.send(
      new QueryCommand({
        TableName: table,
        IndexName: index,
        KeyConditionExpression: 'clientId = :clientId',
        ExpressionAttributeValues: { ':clientId': clientId },
        ExclusiveStartKey,
      })
    )
    items.push(...(res.Items ?? []))
    ExclusiveStartKey = res.LastEvaluatedKey
  } while (ExclusiveStartKey)
  return items
}

/**
 * The same, for tables created on first use (ensure*Table): one that does not
 * exist yet simply has nothing of the guest's in it.
 */
async function queryAllIfTableExists(table: string, index: string, clientId: string): Promise<Record<string, unknown>[]> {
  try {
    return await queryAll(table, index, clientId)
  } catch (err) {
    if (err instanceof Error && err.name === 'ResourceNotFoundException') return []
    throw err
  }
}

/**
 * Running totals kept on the Clients row: the rating aggregate (reviews ABOUT
 * the client) and the wallet. They follow the reviews and the ledger across.
 */
const MOVABLE_TOTALS = ['ratingCount', 'ratingSum', 'walletBalance'] as const

/**
 * Adds the guest's totals onto the account, exactly once.
 *
 * One transaction removes them from the guest and ADDs them to the account,
 * conditioned on the guest still holding precisely the values read. A rerun
 * after success finds nothing left to move; a review or refund landing on
 * the guest in between fails the condition, and the loop re-reads rather than
 * dropping it.
 */
async function moveTotals(guestId: string, accountId: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const guest = await getClient(guestId)
    if (!guest) return
    const held = MOVABLE_TOTALS.filter((field) => typeof guest[field] === 'number')
    const toAdd = held.filter((field) => guest[field] !== 0)
    if (toAdd.length === 0) return

    const guestValues: Record<string, unknown> = { ':acct': accountId }
    const conditions = ['mergingInto = :acct']
    for (const field of MOVABLE_TOTALS) {
      if (held.includes(field)) {
        conditions.push(`${field} = :${field}`)
        guestValues[`:${field}`] = guest[field]
      } else {
        conditions.push(`attribute_not_exists(${field})`)
      }
    }
    const accountValues: Record<string, unknown> = { ':now': new Date().toISOString() }
    for (const field of toAdd) accountValues[`:${field}`] = guest[field]

    try {
      await dynamoDB.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: CLIENTS,
                Key: { id: guestId },
                UpdateExpression: `REMOVE ${held.join(', ')}`,
                ConditionExpression: conditions.join(' AND '),
                ExpressionAttributeValues: guestValues,
              },
            },
            {
              Update: {
                TableName: CLIENTS,
                Key: { id: accountId },
                UpdateExpression: `ADD ${toAdd.map((field) => `${field} :${field}`).join(', ')} SET updatedAt = :now`,
                ConditionExpression: 'attribute_exists(id) AND attribute_not_exists(mergedInto)',
                ExpressionAttributeValues: accountValues,
              },
            },
          ],
        })
      )
      return
    } catch (err) {
      if (!(err instanceof Error && err.name === 'TransactionCanceledException')) throw err
      // Raced with a write to either row — read again and retry.
    }
  }
  throw new Error(`could not move running totals from ${guestId} to ${accountId}`)
}

/** Runs a conditional write and treats "condition no longer holds" as already done. */
async function sendIdempotent(command: UpdateCommand | DeleteCommand): Promise<void> {
  try {
    await dynamoDB.send(command)
  } catch (err) {
    if (!isConditionalCheckFailed(err)) throw err
  }
}

const FILLABLE_VEHICLE_FIELDS = ['vinNumber', 'engineNumber', 'licensePlate', 'color', 'licensePhotoUrl'] as const

/**
 * Moves everything of `guestId` into `accountId`: requests, vehicles, the
 * reviews it wrote or received, its wallet ledger, and the running totals
 * (rating aggregate, wallet balance) that go with them.
 *
 * Idempotent and safe to re-run: the lists come from GSIs, which can lag a
 * write, so every update is conditioned on the row still belonging to the
 * guest — a stale entry turns into a no-op instead of resurrecting a deleted
 * vehicle or re-pointing a request that has already moved.
 */
export async function mergeGuestInto(
  guestId: string,
  accountId: string
): Promise<{ requests: number; vehiclesMoved: number; vehiclesDeduplicated: number; reviews: number }> {
  const now = new Date().toISOString()
  const [guestVehicles, accountVehicles, guestRequests, guestReviews, guestWallet] = await Promise.all([
    queryAll('Vehicles', 'ClientVehiclesIndex', guestId),
    queryAll('Vehicles', 'ClientVehiclesIndex', accountId),
    queryAll('ServiceRequests', 'ClientRequestsIndex', guestId),
    queryAllIfTableExists(REVIEWS_TABLE_NAME, 'ClientReviewsIndex', guestId),
    queryAllIfTableExists(WALLET_TRANSACTIONS, 'ClientWalletIndex', guestId),
  ])

  // guest vehicle id → the account vehicle it duplicates
  const vehicleRedirect = new Map<string, string>()
  let vehiclesMoved = 0

  for (const guestVehicle of guestVehicles) {
    const existing = accountVehicles.find((v) => areVehiclesSame(v as VehicleIdentifier, guestVehicle as VehicleIdentifier))

    if (!existing) {
      await sendIdempotent(
        new UpdateCommand({
          TableName: 'Vehicles',
          Key: { id: guestVehicle.id },
          UpdateExpression: 'SET clientId = :acct, updatedAt = :now',
          ConditionExpression: 'clientId = :guest',
          ExpressionAttributeValues: { ':acct': accountId, ':guest': guestId, ':now': now },
        })
      )
      vehiclesMoved++
      continue
    }

    // Same car: keep the account's row and fill in whatever only the guest knew.
    const sets: string[] = []
    const values: Record<string, unknown> = { ':now': now, ':acct': accountId }
    for (const field of FILLABLE_VEHICLE_FIELDS) {
      if (!existing[field] && guestVehicle[field]) {
        sets.push(`${field} = :${field}`)
        values[`:${field}`] = guestVehicle[field]
      }
    }
    if (sets.length > 0) {
      await sendIdempotent(
        new UpdateCommand({
          TableName: 'Vehicles',
          Key: { id: existing.id },
          UpdateExpression: `SET ${sets.join(', ')}, updatedAt = :now`,
          ConditionExpression: 'clientId = :acct',
          ExpressionAttributeValues: values,
        })
      )
    }
    vehicleRedirect.set(guestVehicle.id as string, existing.id as string)
  }

  for (const req of guestRequests) {
    const redirectTo = vehicleRedirect.get(req.vehicleId as string)
    await sendIdempotent(
      new UpdateCommand({
        TableName: 'ServiceRequests',
        Key: { id: req.id },
        UpdateExpression: redirectTo
          ? 'SET clientId = :acct, vehicleId = :vehicle, updatedAt = :now'
          : 'SET clientId = :acct, updatedAt = :now',
        ConditionExpression: 'clientId = :guest',
        ExpressionAttributeValues: {
          ':acct': accountId,
          ':guest': guestId,
          ':now': now,
          ...(redirectTo ? { ':vehicle': redirectTo } : {}),
        },
      })
    )
  }

  // Duplicates go last, once no request points at them any more.
  for (const guestVehicleId of vehicleRedirect.keys()) {
    await sendIdempotent(
      new DeleteCommand({
        TableName: 'Vehicles',
        Key: { id: guestVehicleId },
        ConditionExpression: 'clientId = :guest',
        ExpressionAttributeValues: { ':guest': guestId },
      })
    )
  }

  // Reviews by and about the guest. Left behind they would vanish from the
  // account's history while still counting in the aggregate moved below.
  for (const review of guestReviews) {
    await sendIdempotent(
      new UpdateCommand({
        TableName: REVIEWS_TABLE_NAME,
        Key: { reviewId: review.reviewId },
        UpdateExpression: 'SET clientId = :acct',
        ConditionExpression: 'clientId = :guest',
        ExpressionAttributeValues: { ':acct': accountId, ':guest': guestId },
      })
    )
  }

  // The ledger behind the wallet balance, so the two still agree afterwards.
  for (const entry of guestWallet) {
    await sendIdempotent(
      new UpdateCommand({
        TableName: WALLET_TRANSACTIONS,
        Key: { transactionId: entry.transactionId },
        UpdateExpression: 'SET clientId = :acct',
        ConditionExpression: 'clientId = :guest',
        ExpressionAttributeValues: { ':acct': accountId, ':guest': guestId },
      })
    )
  }

  // Last, once the reviews and ledger entries they summarise are across.
  await moveTotals(guestId, accountId)

  return {
    requests: guestRequests.length,
    vehiclesMoved,
    vehiclesDeduplicated: vehicleRedirect.size,
    reviews: guestReviews.length,
  }
}
