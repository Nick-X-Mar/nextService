import { NextRequest, NextResponse } from 'next/server'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { ensureSiteContentTable, SITE_CONTENT_TABLE_NAME } from '@/utils/ensureSiteContentTable'
import { getAdminFromRequest } from '@/utils/adminAuth'
import { withMetrics } from '@/utils/withMetrics'
import { getAllAreas } from '@/lib/site-content'
import { SITE_PAGE_KEYS, SITE_PAGE_LABELS } from '@/types/siteContent'

/**
 * Index for the content editor: every editable page and area, and whether it
 * has been changed from the copy compiled into the build.
 */
async function _GET(request: NextRequest) {
  try {
    // Middleware already gates /api/admin, but this endpoint enumerates the
    // whole editable surface — cheap enough to check twice.
    const admin = await getAdminFromRequest(request)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await ensureSiteContentTable()
    const stored = await dynamoDB.send(
      new ScanCommand({
        TableName: SITE_CONTENT_TABLE_NAME,
        ProjectionExpression: 'pageKey, updatedAt, updatedBy',
      })
    )
    const byKey = new Map<string, { updatedAt?: string; updatedBy?: string }>()
    for (const item of stored.Items || []) {
      if (typeof item.pageKey === 'string') {
        byKey.set(item.pageKey, { updatedAt: item.updatedAt, updatedBy: item.updatedBy })
      }
    }

    const pages = SITE_PAGE_KEYS.map((pageKey) => {
      const row = byKey.get(pageKey)
      return {
        pageKey,
        label: SITE_PAGE_LABELS[pageKey].label,
        path: SITE_PAGE_LABELS[pageKey].path,
        edited: !!row,
        updatedAt: row?.updatedAt ?? null,
        updatedBy: row?.updatedBy ?? null,
      }
    })

    const areas = (await getAllAreas()).map((area) => {
      const row = byKey.get(`area:${area.slug}`)
      return {
        slug: area.slug,
        name: area.name,
        region: area.region,
        coverage: area.coverage,
        edited: !!row,
        updatedAt: row?.updatedAt ?? null,
        updatedBy: row?.updatedBy ?? null,
      }
    })

    return NextResponse.json({ pages, areas })
  } catch (error) {
    console.error('Content index error:', error)
    return NextResponse.json({ error: 'Failed to load content index' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
