import { NextRequest, NextResponse } from 'next/server'
import { withMetrics } from '@/utils/withMetrics'
import { estimateFor, type EstimateInput } from './estimate'

async function _POST(request: NextRequest) {
  try {
    // An unreadable body — empty, malformed, or cut off when the form's request
    // is aborted mid-navigation — is the caller's problem, not a 500 that lands
    // in the admin error log.
    const body = (await request.json().catch(() => null)) as EstimateInput | null

    if (!body || typeof body !== 'object' || !body.category || !body.brand) {
      return NextResponse.json(
        { error: 'Missing required fields for price estimation' },
        { status: 400 }
      )
    }

    // We have never quoted this exact car — no history for the category at all (ΚΤΕΟ,
    // ελαστικά), or none close enough to be honest about. Say nothing rather than
    // extrapolate; the client hides the estimate card when estimation is null.
    return NextResponse.json({ success: true, estimation: await estimateFor(body) })
  } catch (error) {
    console.error('Price estimation error:', error)
    return NextResponse.json(
      { error: 'Failed to estimate price' },
      { status: 500 }
    )
  }
}

export const POST = withMetrics(_POST)
