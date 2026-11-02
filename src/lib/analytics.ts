export const GA_MEASUREMENT_ID = 'G-K9TH5KKQVB'

/** Only the real site is measured: not staging, not the *.amplifyapp.com hosts, not a laptop. */
const MEASURED_HOST = 'www.nextservice.gr'
const CONSENT_KEY = 'nextservice-analytics-consent'

/** Asks `AnalyticsConsent` to show its question again, from the footer's «Ρυθμίσεις cookies». */
export const OPEN_CONSENT_EVENT = 'nextservice:analytics-consent'

export type AnalyticsConsent = 'granted' | 'denied'

export const isMeasuredHost = (): boolean => window.location.hostname === MEASURED_HOST

export function readConsent(): AnalyticsConsent | null {
  try {
    const stored = localStorage.getItem(CONSENT_KEY)
    return stored === 'granted' || stored === 'denied' ? stored : null
  } catch {
    return null
  }
}

export function storeConsent(consent: AnalyticsConsent): void {
  try {
    localStorage.setItem(CONSENT_KEY, consent)
  } catch {
    // Private mode: the answer holds for this page, and the question comes back on the next.
  }
}

/**
 * Loads Google Analytics. Call it only with the visitor's consent: the privacy
 * policy promises that nothing of Google's runs, and no statistics cookie is set,
 * before they accept.
 */
export function loadAnalytics(): void {
  const w = window as unknown as { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void }
  if (w.gtag) return
  w.dataLayer = w.dataLayer || []
  // gtag reads `arguments` itself: pushing an array here records nothing.
  w.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments)
  }
  w.gtag('js', new Date())
  w.gtag('config', GA_MEASUREMENT_ID, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  })
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`
  document.head.appendChild(script)
}

/** Withdrawn consent: the cookies go, and the reload that follows drops the running script. */
export function clearAnalyticsCookies(): void {
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0].trim()
    if (!name.startsWith('_ga')) continue
    for (const domain of ['.nextservice.gr', window.location.hostname]) {
      document.cookie = `${name}=; Max-Age=0; path=/; domain=${domain}`
    }
  }
}
