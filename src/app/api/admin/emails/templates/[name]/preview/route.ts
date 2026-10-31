import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/utils/adminAuth'
import { withMetrics } from '@/utils/withMetrics'
import { emailDefinition } from '@/lib/email-templates/catalog'
import { renderDefinition } from '@/lib/email-templates'
import { EmailCopyValidationError, validateEmailCopy } from '@/lib/email-content'

/** Renders an unsaved draft with example values, for the editor's live preview. */
async function _POST(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    const admin = await getAdminFromRequest(request)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const definition = emailDefinition((await params).name)
    if (!definition) return NextResponse.json({ error: 'Άγνωστο email' }, { status: 404 })

    const copy = validateEmailCopy(definition, await request.json().catch(() => null))
    return NextResponse.json({ preview: renderDefinition(definition, definition.example, copy) })
  } catch (error) {
    if (error instanceof EmailCopyValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[admin/emails/templates] preview error:', error)
    return NextResponse.json({ error: 'Failed to render preview' }, { status: 500 })
  }
}

export const POST = withMetrics(_POST)
