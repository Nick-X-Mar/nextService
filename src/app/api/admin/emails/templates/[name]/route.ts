import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/utils/adminAuth'
import { withMetrics } from '@/utils/withMetrics'
import { emailDefinition } from '@/lib/email-templates/catalog'
import {
  EmailCopyValidationError,
  getEmailCopy,
  listEmailOverrides,
  resetEmailCopy,
  saveEmailCopy,
  validateEmailCopy,
} from '@/lib/email-content'
import { describeEmail } from '../shared'

type Params = { params: Promise<{ name: string }> }

async function _GET(request: NextRequest, { params }: Params) {
  try {
    const admin = await getAdminFromRequest(request)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const definition = emailDefinition((await params).name)
    if (!definition) return NextResponse.json({ error: 'Άγνωστο email' }, { status: 404 })

    const stored = (await listEmailOverrides()).get(definition.name)
    const copy = (await getEmailCopy(definition.name)) || definition.copy
    return NextResponse.json({ email: describeEmail(definition, copy, stored) })
  } catch (error) {
    console.error('[admin/emails/templates] read error:', error)
    return NextResponse.json({ error: 'Failed to load email' }, { status: 500 })
  }
}

async function _PUT(request: NextRequest, { params }: Params) {
  try {
    const admin = await getAdminFromRequest(request)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const definition = emailDefinition((await params).name)
    if (!definition) return NextResponse.json({ error: 'Άγνωστο email' }, { status: 404 })

    const copy = validateEmailCopy(definition, await request.json().catch(() => null))
    const stored = await saveEmailCopy(definition.name, copy, admin.email)
    return NextResponse.json({ email: describeEmail(definition, copy, stored) })
  } catch (error) {
    if (error instanceof EmailCopyValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[admin/emails/templates] save error:', error)
    return NextResponse.json({ error: 'Failed to save email' }, { status: 500 })
  }
}

/** Back to the copy that ships with the build. */
async function _DELETE(request: NextRequest, { params }: Params) {
  try {
    const admin = await getAdminFromRequest(request)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const definition = emailDefinition((await params).name)
    if (!definition) return NextResponse.json({ error: 'Άγνωστο email' }, { status: 404 })

    await resetEmailCopy(definition.name)
    return NextResponse.json({ email: describeEmail(definition, definition.copy, null) })
  } catch (error) {
    console.error('[admin/emails/templates] reset error:', error)
    return NextResponse.json({ error: 'Failed to reset email' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
export const PUT = withMetrics(_PUT)
export const DELETE = withMetrics(_DELETE)
