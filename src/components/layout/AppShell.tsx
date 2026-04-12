'use client'

import { Suspense } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import TopHeader from './TopHeader'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import Footer from './Footer'

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { userType, isLoading } = useAuth()
  const pathname = usePathname()

  // Admin routes have their own layout — bypass the main app shell entirely
  if (pathname.startsWith('/admin')) {
    return <>{children}</>
  }

  const isLanding = pathname === '/'
  const isFullPage = pathname.startsWith('/offer/') || pathname === '/login'
  // Clients see the landing page as their "new request" entry point — the
  // sidebar duplicates info that's already in the hero, so we hide it there.
  // Garages always keep their sidebar.
  const showSidebar =
    userType === 'garage' || (userType === 'client' && !isLanding)

  return (
    <>
      <TopHeader />
      {showSidebar && <Sidebar />}
      <main className={`${isLanding ? '' : isFullPage ? 'pt-0' : 'pt-14'} ${isFullPage ? 'pb-0' : 'pb-24'} md:pb-0 ${showSidebar ? 'md:ml-64' : ''}`}>
        {children}
      </main>
      {isLanding && <Footer />}
      <BottomNav />
    </>
  )
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    }>
      <AppShellInner>{children}</AppShellInner>
    </Suspense>
  )
}
