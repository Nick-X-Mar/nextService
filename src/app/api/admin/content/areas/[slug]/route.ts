import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAdminFromRequest } from '@/utils/adminAuth'
import { withMetrics } from '@/utils/withMetrics'
import { defaultAreas, getAreaContent, saveAreaContent } from '@/lib/site-content'
import { ContentValidationError, validateAreaContent } from '@/lib/content-validation'

/**
 * The slug always comes from the route and is checked against the shipped set.
 * Area slugs are inherited from the WordPress site, still carry its search
 * authority, and are the targets of the legacy 301 map in next.config.ts — so
 * an editor may rewrite an area's copy but can neither rename one nor invent a
 * new one. See the header of src/data/locations.ts.
 */
function isKnownSlug(slug: string): boolean {
  return defaultAreas().some((area) => area.slug === slug)
}

async function _GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const admin = await getAdminFromRequest(request)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { slug } = await params
    if (!isKnownSlug(slug)) {
      return NextResponse.json({ error: 'Άγνωστη περιοχή' }, { status: 404 })
    }

    const area = await getAreaContent(slug)
    const defaults = defaultAreas().find((a) => a.slug === slug)
    return NextResponse.json({ area, defaults })
  } catch (error) {
    console.error('Content area read error:', error)
    return NextResponse.json({ error: 'Failed to load area' }, { status: 500 })
  }
}

async function _PUT(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const admin = await getAdminFromRequest(request)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { slug } = await params
    if (!isKnownSlug(slug)) {
      return NextResponse.json({ error: 'Άγνωστη περιοχή' }, { status: 404 })
    }

    const body = await request.json()
    const area = validateAreaContent(body, slug, admin.email)

    await saveAreaContent(area)
    revalidatePath(`/location/${slug}/`)
    revalidatePath('/locations/')

    return NextResponse.json({ success: true, area })
  } catch (error) {
    if (error instanceof ContentValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Content area save error:', error)
    return NextResponse.json({ error: 'Failed to save area' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
export const PUT = withMetrics(_PUT)
