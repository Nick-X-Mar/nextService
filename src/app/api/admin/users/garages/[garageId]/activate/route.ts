import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { sendEmail } from '@/utils/emailService'
import { logEvent } from '@/utils/eventLogger'
import { EventName, EmailTemplate } from '@/types/events'
import { invalidateGarageActive } from '@/utils/requireAuth'
import { parseCommissionPercent } from '@/lib/commission-basis'
import { withMetrics } from '@/utils/withMetrics'
import { TABLES } from '@/lib/tables'

/**
 * The only place a garage becomes active — and therefore the only place that
 * fires GarageValidated and sends the activation email.
 *
 * Body (optional): { commissionPercent } — the rate agreed on the approval call,
 * stored like one set on /admin/commissions/[garageId]. Left out, the garage is
 * on the default, or keeps the rate it already has when it is reactivated.
 */
async function _POST(
  request: NextRequest,
  { params }: { params: Promise<{ garageId: string }> }
) {
  try {
    const { garageId } = await params
    const now = new Date().toISOString()

    const body = await request.json().catch(() => null)
    const rawPercent = (body as { commissionPercent?: unknown } | null)?.commissionPercent
    const commissionPercent = rawPercent === undefined ? null : parseCommissionPercent(rawPercent)
    if (rawPercent !== undefined && commissionPercent === null) {
      return NextResponse.json({ error: 'Το ποσοστό πρέπει να είναι από 0 έως 100' }, { status: 400 })
    }
    const adminEmail = request.headers.get('x-admin-email') || 'admin'

    let garage: Record<string, unknown> | undefined
    try {
      const result = await dynamoDB.send(new UpdateCommand({
        TableName: TABLES.Garages,
        Key: { id: garageId },
        UpdateExpression: `SET isActive = :active, activatedAt = :now, updatedAt = :now${
          commissionPercent === null ? '' : ', commissionPercent = :percent, commissionPercentSetAt = :now, commissionPercentSetBy = :by'
        } REMOVE deactivatedAt`,
        // Without the condition an unknown id would create a bare garage row. A
        // garage that closed its account is anonymized for good — not reopenable.
        ConditionExpression: 'attribute_exists(id) AND attribute_not_exists(anonymizedAt)',
        ExpressionAttributeValues: {
          ':active': true,
          ':now': now,
          ...(commissionPercent === null ? {} : { ':percent': commissionPercent, ':by': adminEmail }),
        },
        ReturnValues: 'ALL_OLD'
      }))
      garage = result.Attributes
    } catch (err) {
      if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
        return NextResponse.json({ error: 'Garage not found' }, { status: 404 })
      }
      throw err
    }

    // requireActiveGarage caches the flag; drop it so approval takes effect now.
    invalidateGarageActive(garageId)

    if (commissionPercent !== null) {
      await logEvent({
        eventName: EventName.GarageCommissionRateChanged,
        actorType: 'admin',
        actorId: request.headers.get('x-admin-id') || 'admin',
        garageId,
        source: 'admin/activate',
        metadata: { commissionPercent, custom: true },
      })
    }

    // Re-approving an already active garage must not mail it again.
    const wasActive = garage?.isActive === true
    if (!wasActive) {
      await logEvent({
        eventName: EventName.GarageValidated,
        actorType: 'admin',
        actorId: request.headers.get('x-admin-id') || 'admin',
        garageId,
        source: 'admin/activate',
        metadata: { companyName: garage?.companyName }
      })

      if (garage?.email) {
        await sendEmail({
          to: garage.email as string,
          templateName: EmailTemplate.GarageActivated,
          variables: {
            companyName: (garage.companyName as string) || '',
            garageId,
          },
          triggerEvent: EventName.GarageValidated,
          garageId,
        })
      }
    }

    return NextResponse.json({ success: true, email: garage?.email, alreadyActive: wasActive })
  } catch (error) {
    console.error('Garage activate error:', error)
    return NextResponse.json({ error: 'Failed to activate garage' }, { status: 500 })
  }
}

export const POST = withMetrics(_POST)
