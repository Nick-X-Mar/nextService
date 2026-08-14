import { NextRequest, NextResponse } from 'next/server'
import { requireGarage } from '@/utils/requireAuth'
import { fetchGarageMessages } from '@/utils/garageMessages'
import { withMetrics } from '@/utils/withMetrics'

async function _GET(request: NextRequest) {
  try {
    const garageId = requireGarage(request)
    if (garageId instanceof NextResponse) return garageId

    // Find all chat messages where this garage is involved
    const messages = await fetchGarageMessages(garageId)

    if (messages.length === 0) {
      return NextResponse.json({ success: true, requestIds: [] })
    }

    // Get unique request IDs
    const requestIds = [...new Set(messages.map((m) => m.requestId as string))]

    return NextResponse.json({ success: true, requestIds })
  } catch (error) {
    console.error('Error fetching garage chats:', error)
    return NextResponse.json(
      { error: 'Error fetching garage chats' },
      { status: 500 }
    )
  }
}

export const GET = withMetrics(_GET)
