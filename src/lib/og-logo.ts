/**
 * Supplies the real NextService logo to the Open Graph image routes.
 *
 * `public/images/next_logo.svg` is true vector art, but Satori's SVG handling
 * is patchy, so it is rasterized here with sharp and handed over as a PNG.
 *
 * Read from disk, never fetched over SITE_URL — an OG route that depends on the
 * site reaching itself over the network breaks exactly when it matters most.
 *
 * IMPORTANT for callers: the logo is orange and charcoal with a transparent
 * background, so it must always be placed on a white backing. On the brand's
 * own orange the word "NEXT" vanishes, on a dark photo "SERVICE" and the gear do.
 * Render it at `LOGO_ASPECT_RATIO` — it is 2114x717, not square.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

const LOGO_SOURCE = join(process.cwd(), 'public', 'images', 'next_logo.svg')

export const LOGO_ASPECT_RATIO = 2114 / 717

let cached: string | null = null

/**
 * Returns the logo as an 800px wide PNG data URI, well above any size a card
 * renders it at. Cached per server process — the source never changes at
 * runtime.
 */
export async function loadLogoDataUri(): Promise<string | null> {
  if (cached) return cached
  try {
    const png = await sharp(await readFile(LOGO_SOURCE))
      .resize({ width: 800 })
      .png()
      .toBuffer()

    cached = `data:image/png;base64,${png.toString('base64')}`
    return cached
  } catch {
    // A missing logo must never take down the whole card — callers fall back
    // to the wordmark set in type.
    return null
  }
}
