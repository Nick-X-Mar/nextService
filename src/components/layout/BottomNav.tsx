'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Icon from '@/components/ui/Icon'

interface NavItem {
  label: string
  icon: string
  href: string
  matchPaths?: string[]
  matchTab?: string
}

export default function BottomNav() {
  const { userType, client, garage } = useAuth()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get('tab')

  const clientNavItems: NavItem[] = client ? [
    { label: 'Αρχική', icon: 'home', href: '/', matchPaths: ['/'] },
    { label: 'Αιτήματα', icon: 'build', href: `/requests/${client.id}`, matchPaths: [`/requests/${client.id}`] },
    { label: 'Μηνύματα', icon: 'chat_bubble', href: `/requests/${client.id}/chats`, matchPaths: [`/requests/${client.id}/chats`] },
    { label: 'Προφίλ', icon: 'person', href: `/profile/${client.id}`, matchPaths: [`/profile/`] },
  ] : [
    { label: 'Αρχική', icon: 'home', href: '/', matchPaths: ['/'] },
    { label: 'Σύνδεση', icon: 'login', href: '/login', matchPaths: ['/login'] },
  ]

  const garageNavItems: NavItem[] = garage ? [
    { label: 'Αιτήματα', icon: 'list_alt', href: `/garage-dashboard/${garage.id}?tab=requests`, matchTab: 'requests', matchPaths: [`/garage-dashboard/${garage.id}`] },
    { label: 'Προσφορές', icon: 'local_offer', href: `/garage-dashboard/${garage.id}?tab=offers`, matchTab: 'offers' },
    { label: 'Ραντεβού', icon: 'calendar_today', href: `/garage-dashboard/${garage.id}?tab=appointments`, matchTab: 'appointments' },
    { label: 'Μηνύματα', icon: 'chat', href: `/garage-dashboard/${garage.id}/chats`, matchPaths: [`/garage-dashboard/${garage.id}/chats`] },
    { label: 'Ρυθμίσεις', icon: 'settings', href: `/garage-dashboard/${garage.id}?tab=settings`, matchTab: 'settings' },
  ] : []

  const navItems = userType === 'garage' ? garageNavItems : clientNavItems

  const isActive = (item: NavItem) => {
    if (item.matchTab && currentTab === item.matchTab) return true
    if (item.matchPaths) {
      return item.matchPaths.some(p => {
        if (p === '/') return pathname === '/'
        return pathname === p || pathname.startsWith(p + '/')
      })
    }
    return false
  }

  // Don't show bottom nav on desktop
  if (!navItems.length) return null

  return (
    <nav className="fixed bottom-0 w-full z-50 md:hidden rounded-t-3xl bg-[#fbf9f8]/80 backdrop-blur-xl border-t border-outline-variant/20 shadow-[0_-4px_20px_0_rgba(0,0,0,0.04)]">
      <div className="flex justify-around items-center h-20 px-2">
        {navItems.map((item) => {
          const active = isActive(item)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center active:scale-90 duration-200 ${
                active
                  ? 'text-primary bg-primary-container/10 rounded-2xl px-4 py-1'
                  : 'text-on-surface/60 hover:text-primary-container'
              }`}
            >
              <Icon name={item.icon} filled={active} />
              <span className="font-body text-[10px] uppercase tracking-[0.05em] font-bold mt-1">
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
