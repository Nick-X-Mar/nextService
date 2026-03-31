'use client'

import { Suspense } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import TopHeader from './TopHeader'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { userType, isLoading } = useAuth()
  const pathname = usePathname()

  const isLanding = pathname === '/'
  const showSidebar = userType === 'client' || userType === 'garage'

  return (
    <>
      <TopHeader />
      {showSidebar && <Sidebar />}
      <main className={`min-h-screen ${isLanding ? '' : 'pt-14'} pb-24 md:pb-0 ${showSidebar ? 'md:ml-64' : ''}`}>
        {children}
      </main>
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
