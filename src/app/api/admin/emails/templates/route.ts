import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/utils/adminAuth'
import { withMetrics } from '@/utils/withMetrics'
import { EMAIL_DEFINITIONS } from '@/lib/email-templates/catalog'
import { renderDefinition } from '@/lib/email-templates'
import { listEmailOverrides, mergeCopy } from '@/lib/email-content'
import { describeEmail } from './shared'

/**
 * Every email the platform sends, with its current copy. `?preview=1` also
 * renders each one with example values, for the "all emails" view.
 */
async function _GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const withPreview = new URL(request.url).searchParams.get('preview') === '1'
    const overrides = await listEmailOverrides()

    const emails = EMAIL_DEFINITIONS.map((definition) => {
      const stored = overrides.get(definition.name)
      const copy = mergeCopy(definition.copy, stored)
      return {
        ...describeEmail(definition, copy, stored),
        ...(withPreview ? { preview: renderDefinition(definition, definition.example, copy) } : {}),
      }
    })
    return NextResponse.json({ emails })
  } catch (error) {
    console.error('[admin/emails/templates] list error:', error)
    return NextResponse.json({ error: 'Failed to load emails' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
