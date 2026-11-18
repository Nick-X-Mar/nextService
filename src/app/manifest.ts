import type { MetadataRoute } from 'next'

/**
 * What makes the site installable as an app — on Android and on a computer
 * from the browser's own install prompt, on an iPhone through «Προσθήκη στην
 * οθόνη Αφετηρίας» (the /app/ page walks people through each). Served at
 * /manifest.webmanifest and linked from every page by Next.
 *
 * The colours are the MD3 tokens `surface` (the page background, also the
 * status bar on Android) and the icon's own charcoal; icons are in
 * public/icons/, the maskable ones with the mark inside the safe circle
 * Android crops to.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'NextService',
    short_name: 'NextService',
    description: 'Αιτήματα, προσφορές, ραντεβού και μηνύματα με τα συνεργεία, σε μία εφαρμογή.',
    lang: 'el',
    dir: 'ltr',
    start_url: '/app/open/',
    scope: '/',
    display: 'standalone',
    background_color: '#fbf9f8',
    theme_color: '#fbf9f8',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
