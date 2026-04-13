import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/utils/adminAuth'
import { withMetrics } from '@/utils/withMetrics'

async function _GET(request: NextRequest) {
  const admin = await getAdminFromRequest(request)

  if (!admin) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  return NextResponse.json({
    adminId: admin.adminId,
    email: admin.email,
    role: admin.role
  })
}

export const GET = withMetrics(_GET)
