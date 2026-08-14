'use client'

import { Suspense } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { NotificationsProvider } from '@/contexts/NotificationsContext'
import TopHeader from './TopHeader'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import Footer from './Footer'

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { userType } = useAuth()
  const pathname = usePathname()

  // Admin routes have their own layout — bypass the main app shell entirely
  if (pathname.startsWith('/admin')) {
    return <>{children}</>
  }

  const isLanding = pathname === '/'
  const isFullPage = pathname.startsWith('/offer/') || pathname === '/login'

  // Chat screens size themselves with `.app-viewport` and pin their composer to
  // the bottom edge. Main's pt-14/pb-24 chrome padding must not stack on top of
  // that height — those extra ~150px are exactly what pushed the composer below
  // the fold and forced the user to scroll down to write a message.
  const isViewportPage =
    /^\/garage-dashboard\/[^/]+\/chat\/[^/]+/.test(pathname) ||
    /^\/requests\/[^/]+\/chats\/[^/]+/.test(pathname)
  const noShellPadding = isFullPage || isViewportPage

  // Public content pages carry the footer; the authenticated app screens don't,
  // because BottomNav already occupies that space on mobile.
  //
  // Without this the footer only rendered on '/', which left Terms, Privacy,
  // Contact, FAQ and the area pages with no route in from anywhere else in the
  // UI — a dead end for visitors and a crawl-depth problem for the pages we
  // most want indexed.
  const isPublicContentPage =
    isLanding ||
    pathname.startsWith('/offer/') ||
    pathname.startsWith('/location') ||
    ['/about', '/faq', '/contact', '/terms', '/privacy', '/register-professional'].some(
      (p) => pathname === p || pathname === `${p}/`
    )
  // Clients see the landing page as their "new request" entry point — the
  // sidebar duplicates info that's already in the hero, so we hide it there.
  // Garages always keep their sidebar.
  const showSidebar =
    userType === 'garage' || (userType === 'client' && !isLanding)

  return (
    <>
      <TopHeader />
      {showSidebar && (
        <Suspense fallback={null}>
          <Sidebar />
        </Suspense>
      )}
      <main className={`${isLanding ? '' : noShellPadding ? 'pt-0' : 'pt-14'} ${noShellPadding ? 'pb-0' : 'pb-24'} md:pb-0 ${showSidebar ? 'md:ml-64' : ''}`}>
        {children}
      </main>
      {isPublicContentPage && <Footer />}
      <Suspense fallback={null}>
        <BottomNav />
      </Suspense>
    </>
  )
}

/**
 * The Suspense boundaries are deliberately scoped to the chrome components that
 * call `useSearchParams` (Sidebar, BottomNav) rather than wrapping `children`.
 *
 * A boundary around all page content breaks more than streaming: React drops
 * inline `<script>` elements rendered inside a Suspense boundary from the
 * statically prerendered HTML, keeping them only in the RSC flight payload. That
 * silently removed every page's JSON-LD from the served markup — invisible to
 * any crawler that doesn't execute JavaScript, which is most AI crawlers. Any
 * page component that needs `useSearchParams` must bring its own local boundary.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <NotificationsProvider>
      <AppShellInner>{children}</AppShellInner>
    </NotificationsProvider>
  )
}
