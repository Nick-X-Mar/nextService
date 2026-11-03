import { test, expect } from '@playwright/test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ICON_NAMES, ICON_FONT_URL } from '../src/lib/icons'
import { loginAdmin } from './E-helpers'

/**
 * Only the icons in src/lib/icons.ts are downloaded; any other renders as its
 * word. This reads the code for every icon name it can name literally and fails
 * on one that is missing from the list. Names that only come from the database
 * (hot deals, page blocks) are checked by the admin forms on save.
 */

const SRC = join(__dirname, '..', 'src')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.(tsx?|json)$/.test(name) ? [path] : []
  })
}

function iconsInCode(): Map<string, string> {
  const found = new Map<string, string>()
  const add = (name: string, file: string) => { if (!found.has(name)) found.set(name, file.replace(SRC, 'src')) }
  for (const file of files(SRC)) {
    if (file.endsWith('icons.ts')) continue
    const code = readFileSync(file, 'utf8')
    // <Icon name="x" />, and every quoted name inside name={cond ? 'a' : 'b'}
    for (const m of code.matchAll(/<Icon\b[\s\S]*?\bname=(\{[^}]*\}|"[^"]*")/g)) {
      for (const q of m[1].matchAll(/['"`]([a-z0-9_]+)['"`]/g)) {
        if (!['credit', 'expired', 'open', 'primary', 'appointment'].includes(q[1])) add(q[1], file)
      }
    }
    // <span className="material-symbols-outlined">x</span>
    for (const m of code.matchAll(/material-symbols-outlined[^>]*>\s*([a-z0-9_]+)\s*</g)) add(m[1], file)
    // { icon: 'x' } in config arrays and data, and "icon": "x" in JSON
    for (const m of code.matchAll(/\bicon\s*:\s*['"]([a-z0-9_]+)['"]/g)) add(m[1], file)
    for (const m of code.matchAll(/"icon"\s*:\s*"([a-z0-9_]+)"/g)) add(m[1], file)
  }
  return found
}

test('Every icon the code uses is in the downloaded icon set', () => {
  const known = new Set<string>(ICON_NAMES)
  const missing = [...iconsInCode()].filter(([name]) => !known.has(name))
  expect(missing, 'add these to src/lib/icons.ts').toEqual([])
})

test('The icon set is sorted, as Google requires, and the page links it', async ({ request }) => {
  expect([...ICON_NAMES]).toEqual([...ICON_NAMES].sort())
  const html = await (await request.get('/about/')).text()
  expect(html).toContain(ICON_FONT_URL.replace(/&/g, '&amp;'))
  expect(html).not.toContain('Material+Symbols+Outlined:wght,FILL@100..700')
})

test('The admin cannot save an icon that is not in the set', async ({ request }) => {
  const Cookie = await loginAdmin(request)
  const res = await request.post('/api/admin/hot-deals/', {
    headers: { Cookie },
    data: { title: 'E2E icon', icon: 'not_an_icon_xyz' },
  })
  expect(res.status()).toBe(400)
  expect((await res.json()).error).toContain('not_an_icon_xyz')
})
