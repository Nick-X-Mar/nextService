import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadLogoDataUri } from '@/lib/og-logo'

export const alt = 'NextService — Βρες συνεργείο αυτοκινήτου με την καλύτερη τιμή'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

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

export default async function Image() {
  const [fonts, logo] = await Promise.all([loadFonts(), loadLogoDataUri()])

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background:
            'linear-gradient(135deg, #8a5100 0%, #ff9900 55%, #ffb86f 100%)',
          color: '#ffffff',
          padding: 72,
          fontFamily: 'Inter',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* The white plate is not decoration — the logo's letterforms are
              knockouts, so whatever sits behind shows through them. Straight on
              this card's orange gradient the word "next" disappears entirely.
              White is the only backing that renders it correctly. */}
          {logo ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 12,
                borderRadius: 20,
                background: '#ffffff',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="NextService" width={150} height={120} />
            </div>
          ) : (
            <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: -1, display: 'flex' }}>
              NextService
            </div>
          )}
          <div style={{ fontSize: 24, fontWeight: 600, opacity: 0.92, display: 'flex' }}>
            Car service marketplace · Ελλάδα
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div
            style={{
              fontSize: 78,
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: -2,
              maxWidth: 980,
            }}
          >
            Βρες συνεργείο με την καλύτερη τιμή.
          </div>
          <div style={{ fontSize: 30, fontWeight: 500, opacity: 0.95, maxWidth: 900 }}>
            Hot deals σε service, συμπλέκτη, ιμάντα χρονισμού & φανοποιεία — εργασία και επώνυμα ανταλλακτικά.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 24, fontWeight: 700 }}>
          <div
            style={{
              background: 'rgba(0,0,0,0.25)',
              borderRadius: 999,
              padding: '10px 22px',
              display: 'flex',
            }}
          >
            nextservice.gr
          </div>
          <div style={{ opacity: 0.85, display: 'flex' }}>
            Στείλε αίτημα · Πάρε προσφορές
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  )
}
