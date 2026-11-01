import { NextRequest, NextResponse } from 'next/server'
import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { requireClient } from '@/utils/requireAuth'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'
import { invalidateUnread } from '@/utils/unreadCache'
import { roundCents } from '@/lib/commission-basis'
import { ServiceRequestStatus } from '@/types/statuses'
import type { ClientConfirmation } from '@/types/reviews'
import { TABLES } from '@/lib/tables'

const checkRate = createRateLimiter('request-confirm', 30, 3600000)

/**
 * The client's word on a job the garage has closed: it went as declared
 * (`confirmed`), or it did not (`disputed`, with what they paid and a note).
 * Given once. It changes no figure by itself — an admin reads it on the
 * commissions page when checking the garage's declaration.
 */
async function _POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const clientId = requireClient(request)
    if (clientId instanceof NextResponse) return clientId

    if (!checkRate(clientId)) {
      return NextResponse.json({ error: 'Πάρα πολλές αιτήσεις. Δοκιμάστε αργότερα.' }, { status: 429 })
    }

    const { requestId } = await params
    const body = (await request.json().catch(() => null)) ?? {}
    if (body.status !== 'confirmed' && body.status !== 'disputed') {
      return NextResponse.json({ error: 'Μη έγκυρη απάντηση.' }, { status: 400 })
    }
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : ''
    let amountPaid: number | undefined
    if (body.status === 'disputed') {
      if (body.amountPaid !== undefined && body.amountPaid !== null && body.amountPaid !== '') {
        const value = typeof body.amountPaid === 'number' ? roundCents(body.amountPaid) : NaN
        if (!Number.isFinite(value) || value < 0 || value > 1_000_000) {
          return NextResponse.json({ error: 'Μη έγκυρο ποσό.' }, { status: 400 })
        }
        amountPaid = value
      }
      if (!note && amountPaid === undefined) {
        return NextResponse.json({ error: 'Πες μας τι έγινε ή πόσο πλήρωσες.' }, { status: 400 })
      }
    }

    const confirmation: ClientConfirmation = {
      status: body.status,
      ...(amountPaid !== undefined ? { amountPaid } : {}),
      ...(note ? { note } : {}),
      at: new Date().toISOString(),
    }

    try {
      await dynamoDB.send(new UpdateCommand({
        TableName: TABLES.ServiceRequests,
        Key: { id: requestId },
        UpdateExpression: 'SET clientConfirmation = :c',
        // Only the owner, only a closed job, only once.
        ConditionExpression:
          'clientId = :clientId AND #status = :completed AND attribute_not_exists(clientConfirmation)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':c': confirmation,
          ':clientId': clientId,
          ':completed': ServiceRequestStatus.COMPLETED,
        },
      }))
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        return NextResponse.json({ error: 'Δεν μπορεί να καταχωρηθεί για αυτή την εργασία.' }, { status: 409 })
      }
      throw err
    }

    invalidateUnread('client', clientId)
    return NextResponse.json({ success: true, confirmation })
  } catch (error) {
    console.error('Error confirming job:', error)
    return NextResponse.json({ error: 'Δεν καταχωρήθηκε. Δοκίμασε ξανά.' }, { status: 500 })
  }
}

export const POST = withMetrics(_POST)
