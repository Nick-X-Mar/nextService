import { GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { ensureSiteContentTable, SITE_CONTENT_TABLE_NAME } from '@/utils/ensureSiteContentTable'
import { createTtlCache } from '@/utils/ttlCache'
import {
  areaContentKey,
  type AreaContent,
  type SitePage,
  type SitePageKey,
} from '@/types/siteContent'
import { DEFAULT_PAGES } from '@/data/content/pages'
import { areas as staticAreas } from '@/data/locations'

/**
 * Reads the admin-editable copy behind the marketing pages.
 *
 * Two rules shape everything here.
 *
 * First, **the static content is the floor, never a placeholder.** Every page
 * ships with its full copy compiled in, and a DynamoDB row only ever overrides
 * it. So an empty table, a throttled read or a mistyped table name degrades to
 * exactly what the site rendered before there was a CMS at all — it can never
 * blank out a public page. Same convention as `src/lib/offers.ts`.
 *
 * Second, **these pages must not become uncached**. They are the SEO surface,
 * and the codebase treats static generation as load-bearing (see the CSP note
 * in next.config.ts). Each page therefore keeps a `revalidate` window, and the
 * per-container cache below only bounds how often a warm container re-reads
 * DynamoDB behind it. Admin saves call `revalidatePath` so an edit is visible
 * without waiting either one out.
 */

const CACHE_TTL_MS = 60_000

const pageCache = createTtlCache<SitePage>(CACHE_TTL_MS)
const areaCache = createTtlCache<AreaContent[]>(CACHE_TTL_MS)

/** The compiled-in copy for a page, used when DynamoDB has no row for it. */
export function defaultPage(pageKey: SitePageKey): SitePage {
  return DEFAULT_PAGES[pageKey]
}

/** The compiled-in area copy, straight from src/data/locations.ts. */
export function defaultAreas(): AreaContent[] {
  return staticAreas.map((area) => ({ ...area }))
}

/**
 * One page's content. Never throws and never returns undefined — a failure
 * here means the visitor sees the shipped copy, not an error.
 */
export async function getSitePage(pageKey: SitePageKey): Promise<SitePage> {
  try {
    return await pageCache.getOrCompute(pageKey, async () => {
      await ensureSiteContentTable()
      const res = await dynamoDB.send(
        new GetCommand({ TableName: SITE_CONTENT_TABLE_NAME, Key: { pageKey } })
      )
      const stored = res.Item as SitePage | undefined
      if (!stored || !Array.isArray(stored.blocks)) return defaultPage(pageKey)
      return stored
    })
  } catch (err) {
    console.error(`[site-content] falling back to static copy for ${pageKey}:`, err)
    return defaultPage(pageKey)
  }
}

/**
 * Every area, with any stored overrides applied.
 *
 * The static list is authoritative for *which* areas exist and for their
 * slugs: those slugs are inherited from the WordPress site, still carry its
 * search authority, and `next.config.ts` points a set of legacy 301s at them
 * by hand. An editor may rewrite an area's copy; it may not invent, remove or
 * rename one. See the note at the top of src/data/locations.ts.
 */
export async function getAllAreas(): Promise<AreaContent[]> {
  try {
    return await areaCache.getOrCompute('all', async () => {
      await ensureSiteContentTable()
      const res = await dynamoDB.send(
        new ScanCommand({
          TableName: SITE_CONTENT_TABLE_NAME,
          FilterExpression: 'begins_with(pageKey, :prefix)',
          ExpressionAttributeValues: { ':prefix': 'area:' },
        })
      )
      const overrides = new Map<string, AreaContent>()
      for (const item of (res.Items || []) as AreaContent[]) {
        if (item?.slug) overrides.set(item.slug, item)
      }
      return defaultAreas().map((area) => {
        const override = overrides.get(area.slug)
        return override ? { ...area, ...override, slug: area.slug } : area
      })
    })
  } catch (err) {
    console.error('[site-content] falling back to static areas:', err)
    return defaultAreas()
  }
}

export async function getAreaContent(slug: string): Promise<AreaContent | undefined> {
  const all = await getAllAreas()
  return all.find((a) => a.slug === slug)
}

/** Writes a page document and drops it from this container's cache. */
export async function saveSitePage(page: SitePage): Promise<void> {
  await ensureSiteContentTable()
  await dynamoDB.send(new PutCommand({ TableName: SITE_CONTENT_TABLE_NAME, Item: page }))
  pageCache.invalidate(page.pageKey)
}

export async function saveAreaContent(area: AreaContent): Promise<void> {
  await ensureSiteContentTable()
  await dynamoDB.send(
    new PutCommand({
      TableName: SITE_CONTENT_TABLE_NAME,
      Item: { ...area, pageKey: areaContentKey(area.slug) },
    })
  )
  areaCache.invalidate('all')
}

/** Drops a page back to its compiled-in copy. */
export async function resetSitePage(pageKey: SitePageKey): Promise<void> {
  await ensureSiteContentTable()
  await dynamoDB.send(
    new PutCommand({ TableName: SITE_CONTENT_TABLE_NAME, Item: { ...defaultPage(pageKey) } })
  )
  pageCache.invalidate(pageKey)
}

/**
 * The most recent edit across all content, for `sitemap.ts`.
 *
 * The sitemap deliberately reports a fixed date rather than crawl time — see
 * the comment there — but an actual content change is exactly the case where
 * `lastModified` should move.
 */
export async function contentLastModified(pageKey: SitePageKey, fallback: Date): Promise<Date> {
  const page = await getSitePage(pageKey)
  const parsed = page.updatedAt ? new Date(page.updatedAt) : null
  return parsed && !isNaN(parsed.getTime()) ? parsed : fallback
}

/**
 * Every question across a page's FAQ blocks, in order.
 *
 * The FAQ JSON-LD has to describe exactly what the page renders, so it is
 * derived from the same blocks rather than from a parallel list that could
 * drift once an editor adds a question.
 */
export function collectFaqItems(
  blocks: SitePage['blocks']
): { question: string; answer: string }[] {
  return blocks.flatMap((block) => (block.type === 'faq' ? block.items : []))
}
