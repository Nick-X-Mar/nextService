import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import staticOffers from '@/data/offers.json'
import { SITE_URL } from '@/lib/site-url'

export const runtime = 'nodejs'
export const alt = 'NextService προσφορά'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

interface Params {
  params: Promise<{ slug: string }>
}

interface StaticOffer {
  slug: string
  image?: string
  title?: string
  subtitle?: string
  price?: string
  category?: string
}

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

async function loadOfferImage(imagePath: string | undefined): Promise<string | null> {
  if (!imagePath) return null
  try {
    const url = imagePath.startsWith('http') ? imagePath : `${SITE_URL}${imagePath}`
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const ext = imagePath.toLowerCase().endsWith('.png') ? 'png' : 'jpeg'
    return `data:image/${ext};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

function findOffer(slug: string): StaticOffer | null {
  try {
    const decoded = decodeURIComponent(slug)
    const offers = staticOffers as StaticOffer[]
    return offers.find((o) => o.slug === decoded) ?? null
  } catch {
    return null
  }
}

export default async function Image({ params }: Params) {
  const { slug } = await params
  const [fonts] = await Promise.all([loadFonts()])
  const offer = findOffer(slug)
  const bg = offer ? await loadOfferImage(offer.image) : null

  const title = offer?.title ?? 'NextService'
  const subtitle = offer?.subtitle ?? ''
  const price = offer?.price ?? ''
  const category = offer?.category === 'fanopeia' ? 'Φανοποιεία' : 'Service'

  return new ImageResponse(
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
        <div
          style={{
            position: 'absolute',
            inset: 0,
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 72,
                height: 72,
                borderRadius: 20,
                background: '#ff9900',
                color: '#1b1c1c',
                fontSize: 42,
                fontWeight: 900,
              }}
            >
              N
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1 }}>
                NextService
              </div>
              <div style={{ fontSize: 20, opacity: 0.85, fontWeight: 500 }}>
                nextservice.gr
              </div>
            </div>
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
}
