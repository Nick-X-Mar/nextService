/**
 * Downloads the Material Symbols subset the site uses (ICON_NAMES in
 * src/lib/icons.ts) into src/app/fonts/, where the root layout serves it with
 * next/font/local — from our own domain, preloaded, instead of a render-blocking
 * stylesheet on fonts.googleapis.com and a second hop to fonts.gstatic.com
 * before any page could paint.
 *
 * Run after adding an icon to ICON_NAMES:
 *   npx tsx scripts/fetch-icon-font.ts
 * e2e/icons.spec.ts fails until the downloaded font matches the list.
 *
 * Material Symbols is Apache-2.0, so self-hosting it is allowed.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ICON_FONT_URL, ICON_NAMES } from '../src/lib/icons'

const OUT_DIR = join(__dirname, '..', 'src', 'app', 'fonts')
// Google answers with woff2 only to a browser it recognises.
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

async function main() {
  const css = await (await fetch(ICON_FONT_URL, { headers: { 'User-Agent': CHROME_UA } })).text()
  const fontUrl = css.match(/src:\s*url\((https:[^)]+)\)\s*format\('woff2'\)/)?.[1]
  if (!fontUrl) throw new Error(`No woff2 in the Google Fonts response:\n${css.slice(0, 500)}`)

  const font = Buffer.from(await (await fetch(fontUrl)).arrayBuffer())
  writeFileSync(join(OUT_DIR, 'material-symbols-outlined.woff2'), font)
  writeFileSync(
    join(OUT_DIR, 'material-symbols-outlined.json'),
    JSON.stringify({ iconNames: ICON_NAMES }, null, 2) + '\n'
  )
  console.log(`${ICON_NAMES.length} icons, ${Math.round(font.length / 1024)} KB → src/app/fonts/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
