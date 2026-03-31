'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Icon from '@/components/ui/Icon'

interface NavItem {
  label: string
  icon: string
  href: string
  matchTab?: string
}

export default function Sidebar() {
  const { userType, client, garage, logout } = useAuth()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get('tab')

  const clientNavItems: NavItem[] = client ? [
    { label: 'Νέο Αίτημα', icon: 'add_circle', href: '/' },
    { label: 'Αιτήματα', icon: 'build', href: `/requests/${client.id}` },
    { label: 'Ραντεβού', icon: 'calendar_today', href: `/requests/${client.id}?tab=appointment`, matchTab: 'appointment' },
    { label: 'Μηνύματα', icon: 'chat', href: `/requests/${client.id}/chats` },
    { label: 'Προφίλ', icon: 'person', href: `/profile/${client.id}` },
  ] : []

  const garageNavItems: NavItem[] = garage ? [
    { label: 'Νέα Αιτήματα', icon: 'list_alt', href: `/garage-dashboard/${garage.id}?tab=requests`, matchTab: 'requests' },
    { label: 'Προσφορές', icon: 'local_offer', href: `/garage-dashboard/${garage.id}?tab=offers`, matchTab: 'offers' },
    { label: 'Ραντεβού', icon: 'calendar_today', href: `/garage-dashboard/${garage.id}?tab=appointments`, matchTab: 'appointments' },
    { label: 'Ανοιχτές Συνομιλίες', icon: 'chat', href: `/garage-dashboard/${garage.id}/chats` },
    { label: 'Συνομιλίες Ραντεβού', icon: 'forum', href: `/garage-dashboard/${garage.id}/chats/appointments` },
    { label: 'Ρυθμίσεις', icon: 'settings', href: `/garage-dashboard/${garage.id}?tab=settings`, matchTab: 'settings' },
  ] : []

  const navItems = userType === 'garage' ? garageNavItems : clientNavItems

  const isActive = (item: NavItem) => {
    if (item.matchTab) {
      return currentTab === item.matchTab
    }
    // Exact match for root, startsWith for other paths
    if (item.href === '/') return pathname === '/'
    const basePath = item.href.split('?')[0]
    return pathname === basePath || pathname.startsWith(basePath + '/')
  }

  if (!userType || userType === 'guest') return null

  const displayName = userType === 'garage' ? garage?.companyName : `${client?.firstName || ''} ${client?.lastName || ''}`.trim()

  return (
    <aside className="hidden md:flex fixed left-0 top-16 h-[calc(100vh-64px)] w-64 bg-surface-container-lowest border-r border-outline-variant/20 z-40 flex-col">
      {/* User info */}
      <div className="px-6 py-6">
        <div className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-1">
          {userType === 'garage' ? 'Συνεργείο' : 'Πελάτης'}
        </div>
        <div className="text-on-surface font-bold text-base truncate">
          {displayName || 'Χρήστης'}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wider transition-all hover:translate-x-1 duration-200 ${
              isActive(item)
                ? 'bg-primary-container/10 text-primary'
                : 'text-secondary hover:bg-surface-container hover:text-on-surface'
            }`}
          >
            <Icon name={item.icon} filled={isActive(item)} className={isActive(item) ? 'text-primary' : ''} />
            <span className="text-xs">{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="px-4 py-6 border-t border-outline-variant/10">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold text-secondary hover:text-tertiary hover:bg-surface-container transition-colors"
        >
          <Icon name="logout" />
          <span className="text-xs uppercase tracking-wider">Αποσύνδεση</span>
        </button>
      </div>
    </aside>
  )
}
