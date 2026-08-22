import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAdminFromRequest } from '@/utils/adminAuth'
import { withMetrics } from '@/utils/withMetrics'
import { defaultPage, getSitePage, resetSitePage, saveSitePage } from '@/lib/site-content'
import { ContentValidationError, validateSitePage } from '@/lib/content-validation'
import { isSitePageKey, SITE_PAGE_LABELS, type SitePageKey } from '@/types/siteContent'

/**
 * Pushes the edit straight to the public page.
 *
 * Each page carries `revalidate = 300`, so without this an editor would sit
 * looking at the old copy for up to five minutes and reasonably conclude the
 * save had failed. `/` is included for the landing page's FAQ block.
 */
function revalidateFor(pageKey: SitePageKey) {
  revalidatePath(SITE_PAGE_LABELS[pageKey].path)
  if (pageKey === 'home-faq' || pageKey === 'faq') revalidatePath('/')
}

async function _GET(
  request: NextRequest,
  { params }: { params: Promise<{ pageKey: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { pageKey } = await params
    if (!isSitePageKey(pageKey)) {
      return NextResponse.json({ error: 'Άγνωστη σελίδα' }, { status: 404 })
    }

    const page = await getSitePage(pageKey)
    return NextResponse.json({
      page,
      // Lets the editor show a diff-free "reset" affordance without a second
      // round trip.
      defaults: defaultPage(pageKey),
      meta: SITE_PAGE_LABELS[pageKey],
    })
  } catch (error) {
    console.error('Content page read error:', error)
    return NextResponse.json({ error: 'Failed to load page' }, { status: 500 })
  }
}

async function _PUT(
  request: NextRequest,
  { params }: { params: Promise<{ pageKey: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { pageKey } = await params
    if (!isSitePageKey(pageKey)) {
      return NextResponse.json({ error: 'Άγνωστη σελίδα' }, { status: 404 })
    }

    const body = await request.json()
    // The route decides which page is being written, not the payload.
    const page = validateSitePage({ ...body, pageKey }, admin.email)

    await saveSitePage(page)
    revalidateFor(pageKey)

    return NextResponse.json({ success: true, page })
  } catch (error) {
    if (error instanceof ContentValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Content page save error:', error)
    return NextResponse.json({ error: 'Failed to save page' }, { status: 500 })
  }
}

/** Restores the copy that ships with the build. */
async function _DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ pageKey: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { pageKey } = await params
    if (!isSitePageKey(pageKey)) {
      return NextResponse.json({ error: 'Άγνωστη σελίδα' }, { status: 404 })
    }

    await resetSitePage(pageKey)
    revalidateFor(pageKey)

    return NextResponse.json({ success: true, page: defaultPage(pageKey) })
  } catch (error) {
    console.error('Content page reset error:', error)
    return NextResponse.json({ error: 'Failed to reset page' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
export const PUT = withMetrics(_PUT)
export const DELETE = withMetrics(_DELETE)
