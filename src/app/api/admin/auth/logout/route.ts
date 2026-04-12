import { NextResponse } from 'next/server'
import { clearAdminCookie } from '@/utils/adminAuth'

export async function POST() {
  const response = NextResponse.json({ success: true })
  clearAdminCookie(response)
  return response
}
