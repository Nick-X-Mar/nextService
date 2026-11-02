import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { LOGO_ASPECT_RATIO, loadLogoDataUri } from '@/lib/og-logo'

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
      // Everything sits in the middle 630px: Messenger crops this card to a centred
      // square, which cut the logo and the headline when they ran along the edges.
      // White, because the logo's orange NEXT vanishes on the brand's own orange.
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#ffffff',
          color: '#161616',
          borderBottom: '16px solid #ff9900',
          fontFamily: 'Inter',
        }}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="NextService" width={560} height={Math.round(560 / LOGO_ASPECT_RATIO)} />
        ) : (
          <div style={{ fontSize: 72, fontWeight: 900, letterSpacing: -2, display: 'flex' }}>NextService</div>
        )}
        <div
          style={{
            display: 'flex',
            marginTop: 32,
            width: 580,
            justifyContent: 'center',
            textAlign: 'center',
            fontSize: 46,
            fontWeight: 900,
            lineHeight: 1.15,
            letterSpacing: -1,
          }}
        >
          Βρες συνεργείο με την καλύτερη τιμή
        </div>
        <div style={{ display: 'flex', marginTop: 18, fontSize: 28, fontWeight: 700, color: '#554434' }}>
          Στείλε αίτημα · Πάρε προσφορές
        </div>
      </div>
    ),
    { ...size, fonts },
  )
}
