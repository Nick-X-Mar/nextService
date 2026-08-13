/**
 * Supplies the real NextService logo to the Open Graph image routes.
 *
 * `public/images/next_logo.svg` is not true vector art — it's an SVG wrapper
 * around a single 100x80 base64 PNG. Satori's SVG handling is patchy, and
 * there's no fidelity to gain from the wrapper, so the embedded raster is
 * extracted and upscaled with sharp instead. 100x80 is the highest-resolution
 * original that exists; if a larger master ever turns up, drop it in as a plain
 * PNG and point `LOGO_SOURCE` at it.
 *
 * Read from disk, never fetched over SITE_URL — an OG route that depends on the
 * site reaching itself over the network breaks exactly when it matters most.
 *
 * IMPORTANT for callers: the letterforms in this artwork are KNOCKOUTS, not
 * white ink. They take the colour of whatever is behind them, so the logo must
 * always be placed on a white backing. On the brand's own orange the word
 * "next" vanishes completely.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

const LOGO_SOURCE = join(process.cwd(), 'public', 'images', 'next_logo.svg')

let cached: string | null = null

/**
 * Returns the logo as a PNG data URI, upscaled 4x so it stays smooth when the
 * card renders it larger than native. Cached per server process — the source
 * never changes at runtime.
 */
export async function loadLogoDataUri(): Promise<string | null> {
  if (cached) return cached
  try {
    const svg = await readFile(LOGO_SOURCE, 'utf-8')
    const match = svg.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/)
    if (!match) return null

    const upscaled = await sharp(Buffer.from(match[1], 'base64'))
      .resize({ width: 400, kernel: 'lanczos3' })
      .png()
      .toBuffer()

    cached = `data:image/png;base64,${upscaled.toString('base64')}`
    return cached
  } catch {
    // A missing logo must never take down the whole card — callers fall back
    // to the wordmark set in type.
    return null
  }
}
