import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { getOfferBySlug } from '@/lib/offers'
import { loadLogoDataUri } from '@/lib/og-logo'

export const runtime = 'nodejs'
export const alt = 'NextService προσφορά'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/jpeg'

interface Params {
  params: Promise<{ slug: string }>
}

/**
 * Fonts are read off disk, NOT fetched over HTTP from SITE_URL.
 *
 * This route used to `fetch(`${SITE_URL}/fonts/...`)`, which makes rendering a
 * share preview depend on the site being able to reach itself over the network
 * at whatever SITE_URL currently points to. During the WordPress→Next cutover
 * that domain still served the old site, every font request 404'd, and the
 * whole route returned 500 — so sharing an offer link produced a bare URL with
 * no preview card at all. Reading from `public/` removes the dependency
 * entirely, and matches what `app/opengraph-image.tsx` already does.
 */
async function loadFonts() {
  const dir = join(process.cwd(), 'public', 'fonts')
  const [regular, bold, black] = await Promise.all([
    readFile(join(dir, 'inter-greek-400.woff')),
    readFile(join(dir, 'inter-greek-700.woff')),
    readFile(join(dir, 'inter-greek-900.woff')),
  ])
  return [
    { name: 'Inter', data: regular, weight: 400 as const, style: 'normal' as const },
    { name: 'Inter', data: bold, weight: 700 as const, style: 'normal' as const },
    { name: 'Inter', data: black, weight: 900 as const, style: 'normal' as const },
  ]
}

/**
 * Bundled offer artwork lives in `public/`, so read it from disk for the same
 * reason as the fonts. Only genuinely remote images (S3 uploads) go over the
 * network, and a failure there just drops the background — the card still
 * renders with the title and price.
 */
async function loadOfferImage(imagePath: string | undefined): Promise<string | null> {
  if (!imagePath) return null
  const ext = imagePath.toLowerCase().endsWith('.png') ? 'png' : 'jpeg'
  try {
    let buf: Buffer
    if (imagePath.startsWith('http')) {
      const res = await fetch(imagePath)
      if (!res.ok) return null
      buf = Buffer.from(await res.arrayBuffer())
    } else {
      buf = await readFile(join(process.cwd(), 'public', imagePath.replace(/^\//, '')))
    }
    return `data:image/${ext};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

export default async function Image({ params }: Params) {
  const { slug } = await params
  // Same source as the page itself (DynamoDB first, static JSON as fallback).
  // Reading only the static JSON meant any deal created in the admin panel
  // shared as a blank "NextService" card.
  const [fonts, logo, offer] = await Promise.all([
    loadFonts(),
    loadLogoDataUri(),
    getOfferBySlug(decodeURIComponent(slug)).catch(() => null),
  ])
  const bg = offer ? await loadOfferImage(offer.image) : null

  const title = offer?.title ?? 'NextService'
  const subtitle = offer?.subtitle ?? ''
  const price = offer?.price ?? ''
  const category = offer?.category === 'fanopeia' ? 'Φανοποιεία' : 'Service'

  const img = new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: '#1b1c1c',
          fontFamily: 'Inter',
          color: '#ffffff',
        }}
      >
        {bg && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bg}
            alt=""
            width={1200}
            height={630}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        )}
        {/* Satori does not implement the `inset` shorthand, so this overlay was
            silently rendering at zero size — every offer shared with a bright
            photo came out with unreadable text over a washed-out background.
            The edges are set individually, plus explicit dimensions. */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            height: '100%',
            background:
              'linear-gradient(100deg, rgba(27,28,28,0.92) 0%, rgba(27,28,28,0.82) 45%, rgba(138,81,0,0.55) 100%)',
            display: 'flex',
          }}
        />

        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: 72,
            width: '100%',
            height: '100%',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* White plate is required, not stylistic: the logo's letters are
                knockouts and take the colour of whatever is behind them, so on
                a photo background the wordmark would be unreadable. */}
            {logo ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 10,
                  borderRadius: 18,
                  background: '#ffffff',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo} alt="NextService" width={125} height={100} />
              </div>
            ) : (
              <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1, display: 'flex' }}>
                NextService
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div
              style={{
                display: 'flex',
                alignSelf: 'flex-start',
                padding: '8px 20px',
                borderRadius: 999,
                background: 'rgba(255,153,0,0.22)',
                border: '2px solid #ff9900',
                color: '#ffb86f',
                fontSize: 22,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 2,
              }}
            >
              {category}
            </div>
            <div
              style={{
                fontSize: title.length > 18 ? 84 : 104,
                fontWeight: 900,
                lineHeight: 1.02,
                letterSpacing: -3,
                maxWidth: 1000,
              }}
            >
              {title}
            </div>
            {subtitle && (
              <div style={{ fontSize: 32, fontWeight: 500, opacity: 0.92, maxWidth: 960 }}>
                {subtitle}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            {price && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 22, fontWeight: 600, opacity: 0.8, textTransform: 'uppercase', letterSpacing: 2 }}>
                  Από
                </div>
                <div style={{ fontSize: 108, fontWeight: 900, color: '#ff9900', lineHeight: 1, letterSpacing: -3 }}>
                  {price}
                </div>
              </div>
            )}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '16px 28px',
                borderRadius: 16,
                background: '#ff9900',
                color: '#1b1c1c',
                fontSize: 26,
                fontWeight: 900,
              }}
            >
              Πάρε Προσφορά →
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  )

  // Re-encode PNG → JPEG for smaller file size (WhatsApp/Messenger require <600KB).
  const png = Buffer.from(await img.arrayBuffer())
  const jpeg = await sharp(png).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
  return new Response(new Uint8Array(jpeg), {
    headers: {
      'content-type': 'image/jpeg',
      'cache-control': 'public, immutable, no-transform, max-age=31536000',
    },
  })
}
