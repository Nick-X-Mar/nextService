import { NextResponse } from 'next/server'
import { clearAdminCookie } from '@/utils/adminAuth'
import { withMetrics } from '@/utils/withMetrics'

async function _POST() {
  const response = NextResponse.json({ success: true })
  clearAdminCookie(response)
  return response
}

export const POST = withMetrics(_POST)
