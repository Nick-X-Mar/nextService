'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Icon from '@/components/ui/Icon'
import { styles } from '@/styles/styles'

// Meta's apps (Facebook, Messenger, Instagram) capture every link tapped inside
// them and render it in an embedded webview instead of the phone's browser.
// Nothing on the server side can change that — no header, no meta tag. The only
// escape is client-side:
//   • Android — navigate to an intent:// URL, which the webview hands to Chrome.
//   • iOS     — no programmatic escape exists (Meta closed off the old
//               x-safari-https:// trick), so all we can do is copy the link and
//               tell the user where the "open in browser" menu item is.

const IN_APP_UA =
  /FBAN|FBAV|FB_IAB|FBIOS|FBDV|FBSV|Instagram|Line\/|MicroMessenger|TikTok|Snapchat/i

// Dismissal lasts for the browsing session only.
const DISMISS_KEY = 'ns-inapp-escape-dismissed'
// The Android auto-redirect fires at most once, so a webview that swallows the
// intent can't put us in a reload loop.
const REDIRECT_KEY = 'ns-inapp-escape-redirected'

type Platform = 'android' | 'ios' | 'other'

/** sessionStorage throws in some webviews (private mode, blocked storage). */
function readFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeFlag(key: string) {
  try {
    sessionStorage.setItem(key, '1')
  } catch {
    /* storage blocked — worst case the banner reappears */
  }
}

/**
 * `#` separates the intent's fragment, so the page's own hash can't be carried
 * along — it would terminate the URI early. Links we share don't use one.
 */
function buildIntentUrl(): string {
  const { host, pathname, search, href } = window.location
  const fallback = encodeURIComponent(href)
  return `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`
}

export default function InAppBrowserEscape() {
  const pathname = usePathname()
  const [platform, setPlatform] = useState<Platform | null>(null)
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const ua = navigator.userAgent || ''
    if (!IN_APP_UA.test(ua)) return
    if (readFlag(DISMISS_KEY)) return

    const isAndroid = /Android/i.test(ua)
    const isIOS = /iPad|iPhone|iPod/i.test(ua)
    setPlatform(isAndroid ? 'android' : isIOS ? 'ios' : 'other')

    if (isAndroid && !readFlag(REDIRECT_KEY)) {
      writeFlag(REDIRECT_KEY)
      window.location.href = buildIntentUrl()
      // If the webview refused the intent we're still on this page a moment
      // later, and the user needs the manual button instead.
      const timer = setTimeout(() => setVisible(true), 1500)
      return () => clearTimeout(timer)
    }

    setVisible(true)
  }, [])

  const dismiss = useCallback(() => {
    writeFlag(DISMISS_KEY)
    setVisible(false)
  }, [])

  const openInChrome = useCallback(() => {
    window.location.href = buildIntentUrl()
  }, [])

  const copyLink = useCallback(async () => {
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Older webviews have no async clipboard — fall back to a hidden textarea.
      const field = document.createElement('textarea')
      field.value = url
      field.setAttribute('readonly', '')
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.appendChild(field)
      field.select()
      try {
        document.execCommand('copy')
      } catch {
        return
      } finally {
        document.body.removeChild(field)
      }
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }, [])

  // The admin panel is never reached through a shared social link.
  if (!visible || !platform || pathname?.startsWith('/admin')) return null

  return (
    <div
      className="fixed inset-x-0 top-0 z-[60] px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]"
      role="status"
    >
      <div className="mx-auto flex max-w-md items-start gap-3 rounded-xl border border-outline-variant/20 bg-surface-container-lowest/95 p-3 shadow-[0_8px_32px_rgba(27,28,28,0.16)] backdrop-blur-xl">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-container text-on-primary">
          <Icon name="open_in_new" size="md" />
        </span>

        <div className="min-w-0 flex-1">
          <p className={styles.labelUpper}>Άνοιγμα σε browser</p>
          {platform === 'android' ? (
            <p className="mt-0.5 text-sm text-secondary leading-snug">
              Βλέπεις τη σελίδα μέσα από την εφαρμογή. Άνοιξέ την στον Chrome για
              να δουλέψουν όλα σωστά.
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-secondary leading-snug">
              Βλέπεις τη σελίδα μέσα από την εφαρμογή. Πάτα το{' '}
              <span className="font-bold text-on-surface">⋯</span> πάνω δεξιά και
              διάλεξε «Άνοιγμα σε πρόγραμμα περιήγησης».
            </p>
          )}

          <div className="mt-2.5 flex items-center gap-2">
            {platform === 'android' ? (
              <button
                type="button"
                onClick={openInChrome}
                className="bg-gradient-to-br from-primary to-primary-container text-on-primary px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 active:scale-95 shadow-lg shadow-primary/20 flex items-center gap-1.5"
              >
                <Icon name="open_in_browser" size="sm" />
                Άνοιγμα στον Chrome
              </button>
            ) : (
              <button
                type="button"
                onClick={copyLink}
                className="border border-outline-variant/30 bg-surface-container-lowest text-on-surface hover:bg-surface-container px-4 py-2 rounded-lg text-xs font-bold transition-colors duration-200 active:scale-95 flex items-center gap-1.5"
              >
                <Icon name={copied ? 'check' : 'content_copy'} size="sm" />
                {copied ? 'Αντιγράφηκε' : 'Αντιγραφή link'}
              </button>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Κλείσιμο"
          className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container active:scale-95"
        >
          <Icon name="close" size="sm" />
        </button>
      </div>
    </div>
  )
}
