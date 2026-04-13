import { NextResponse } from 'next/server'
import { clearAuthCookie } from '@/utils/auth'
import { withMetrics } from '@/utils/withMetrics'

async function _POST() {
  const response = NextResponse.json({ success: true })
  clearAuthCookie(response)
  return response
}

export const POST = withMetrics(_POST)
