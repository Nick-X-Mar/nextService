/**
 * The site as an installed app (the PWA, src/app/manifest.ts), browser side:
 * whether this is it, how this browser installs it, and the service worker
 * (public/sw.js) behind its notifications and offline page.
 */

/** The browser's install offer (Chrome, Edge, Samsung Internet). Not in TypeScript's DOM types. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface Window {
    /** Caught by INSTALL_PROMPT_SCRIPT before React loads; see there. */
    __installPrompt?: BeforeInstallPromptEvent | null
  }
}

/**
 * Inline in <body> (layout.tsx). The browser offers the install once, as the
 * page loads, possibly before React has hydrated anything to listen: this
 * keeps the offer for the «Εγκατάσταση» button, and keeps Chrome's own
 * banner off the homepage of everyone sending a request.
 */
export const INSTALL_PROMPT_SCRIPT =
  "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__installPrompt=e});" +
  "window.addEventListener('appinstalled',function(){window.__installPrompt=null})"

/** Running as the installed app, not in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: window-controls-overlay)').matches
    // Safari on iOS before it knew display-mode.
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/** iPhone or iPad, whatever the browser (they are all Safari underneath). iPadOS says it is a Mac. */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/**
 * How this browser puts the app on the device:
 * - `prompt`: it offered to install (Chrome, Edge, Samsung Internet) — one tap
 * - `ios`: Share → «Προσθήκη στην οθόνη Αφετηρίας»
 * - `mac-safari`: File → «Προσθήκη στο Dock»
 * - `android-menu`: the browser's menu, «Εγκατάσταση εφαρμογής» (Firefox, or
 *   Chrome before it has made its offer)
 * - `desktop-menu`: Chrome or Edge on a computer without an offer (it was
 *   installed before, or dismissed): the install icon in the address bar
 * - `other-browser`: not from here; Chrome or Edge can (Firefox on a computer)
 * - `installed`: this is the app
 */
export type InstallRoute = 'prompt' | 'ios' | 'mac-safari' | 'android-menu' | 'desktop-menu' | 'other-browser' | 'installed'

export function installRoute(): InstallRoute {
  if (isStandalone()) return 'installed'
  if (window.__installPrompt) return 'prompt'
  const ua = navigator.userAgent
  if (isIOS()) return 'ios'
  if (/Android/.test(ua)) return 'android-menu'
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua)) return 'mac-safari'
  if (/Chrome|Chromium|Edg/.test(ua)) return 'desktop-menu'
  return 'other-browser'
}

/** Calls `onChange` when the browser makes its install offer, or the app gets installed. */
export function watchInstall(onChange: () => void): () => void {
  const later = () => setTimeout(onChange, 0) // after INSTALL_PROMPT_SCRIPT's own listener
  window.addEventListener('beforeinstallprompt', later)
  window.addEventListener('appinstalled', later)
  return () => {
    window.removeEventListener('beforeinstallprompt', later)
    window.removeEventListener('appinstalled', later)
  }
}

/** Shows the browser's install dialog. The offer can be used once. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const offer = window.__installPrompt
  if (!offer) return 'unavailable'
  window.__installPrompt = null
  await offer.prompt()
  return (await offer.userChoice).outcome
}

/** The service worker, registered once per page; null where there is none. */
let registration: Promise<ServiceWorkerRegistration | null> | null = null

export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve(null)
  registration ??= navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .catch((error) => {
      console.warn('[pwa] Service worker registration failed:', error)
      registration = null
      return null
    })
  return registration
}
