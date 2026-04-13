import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { getStripe } from '@/lib/stripe-server'
import type { SavedCard } from '@/types/payments'
import { requireClient } from '@/utils/requireAuth'
import { withMetrics } from '@/utils/withMetrics'

async function _GET(request: NextRequest) {
  try {
    const clientId = requireClient(request)
    if (clientId instanceof NextResponse) return clientId

    const clientRes = await dynamoDB.send(
      new GetCommand({ TableName: 'Clients', Key: { id: clientId } })
    )
    const stripeCustomerId = clientRes.Item?.stripeCustomerId as string | undefined

    if (!stripeCustomerId) {
      return NextResponse.json({ success: true, savedCards: [] })
    }

    const stripe = getStripe()
    const paymentMethods = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      type: 'card'
    })

    const savedCards: SavedCard[] = paymentMethods.data.map((pm) => ({
      paymentMethodId: pm.id,
      brand: pm.card?.brand || 'unknown',
      last4: pm.card?.last4 || '****',
      expMonth: pm.card?.exp_month || 0,
      expYear: pm.card?.exp_year || 0
    }))

    return NextResponse.json({ success: true, savedCards })
  } catch (error) {
    console.error('Error fetching saved cards:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch saved cards',
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

export const GET = withMetrics(_GET)
