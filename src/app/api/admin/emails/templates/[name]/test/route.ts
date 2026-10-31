import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/utils/adminAuth'
import { withMetrics } from '@/utils/withMetrics'
import { emailDefinition } from '@/lib/email-templates/catalog'
import { EmailCopyValidationError, validateEmailCopy } from '@/lib/email-content'
import { isNotificationsEnabled, sendEmail } from '@/utils/emailService'

/**
 * Sends the draft, filled with example values, to the signed-in admin — never
 * to an address from the body, so this cannot be used to mail anyone else.
 */
async function _POST(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    const admin = await getAdminFromRequest(request)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const definition = emailDefinition((await params).name)
    if (!definition) return NextResponse.json({ error: 'Άγνωστο email' }, { status: 404 })

    const copy = validateEmailCopy(definition, await request.json().catch(() => null))

    if (!isNotificationsEnabled()) {
      return NextResponse.json(
        { error: 'Οι αποστολές είναι κλειστές σε αυτό το περιβάλλον (NOTIFICATIONS_ENABLED).' },
        { status: 412 }
      )
    }

    await sendEmail({
      to: admin.email,
      templateName: definition.name,
      variables: definition.example,
      triggerEvent: 'admin_test_email',
      copy,
    })
    return NextResponse.json({ ok: true, to: admin.email })
  } catch (error) {
    if (error instanceof EmailCopyValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[admin/emails/templates] test send error:', error)
    return NextResponse.json({ error: 'Failed to send test' }, { status: 500 })
  }
}

export const POST = withMetrics(_POST)
