/**
 * Decides which navigation entry is the current one.
 *
 * Both navs used to ask each item "does the URL start with your path?" and
 * highlight every item that said yes. Nested destinations therefore lit two
 * tabs at once: `/requests/<id>/chats` lives inside `/requests/<id>`, so
 * Αιτήματα and Μηνύματα were both marked current, and the same happened to the
 * garage's two chat entries under `/garage-dashboard/<id>/chats`.
 *
 * Resolving a single winner instead of a per-item boolean is what fixes it: the
 * deepest matching prefix takes the tab, so `/requests/<id>/details/<id>` stays
 * on Αιτήματα (its only match) while the chat routes go to Μηνύματα. Ties fall
 * to declaration order, which keeps a page and its own default tab together.
 */
export interface ActiveNavItem {
  href: string
  /** Marks a `?tab=` destination on a page shared by several entries. */
  matchTab?: string
  /** Paths this entry owns. Defaults to the href with its query stripped. */
  matchPaths?: string[]
}

/**
 * `trailingSlash: true` hands us `/requests/x/chats/` while nav paths are
 * written both ways, so every comparison happens without the trailing slash.
 */
function trimSlash(path: string): string {
  return path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path
}

export function resolveActiveHref(
  items: ActiveNavItem[],
  pathname: string,
  currentTab: string | null
): string | null {
  // An explicit ?tab= names its destination outright, so it settles the question
  // before any prefix matching happens.
  const byTab = items.find(item => item.matchTab && currentTab === item.matchTab)
  if (byTab) return byTab.href

  const currentPath = trimSlash(pathname)
  let best: { href: string; depth: number } | null = null

  for (const item of items) {
    const paths = item.matchPaths ?? [item.href.split('?')[0]]
    for (const path of paths) {
      const target = trimSlash(path)
      const hit =
        target === '/'
          ? currentPath === '/'
          : currentPath === target || currentPath.startsWith(target + '/')
      if (hit && (!best || target.length > best.depth)) {
        best = { href: item.href, depth: target.length }
      }
    }
  }

  return best?.href ?? null
}
