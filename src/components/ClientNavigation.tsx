'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import { styles } from '../styles/styles'

interface ClientNavigationProps {
  clientId: string
}

export default function ClientNavigation({ clientId }: ClientNavigationProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')

  const isRequestsTabActive = (tab: 'open' | 'appointment') => {
    if (pathname !== `/requests/${clientId}`) return false

    if (tab === 'appointment') {
      return tabParam === 'appointment'
    }

    // Default to "Αιτήματα" when no specific appointment tab is selected
    return tabParam !== 'appointment'
  }

  const navItems = [
    {
      href: '/',
      label: 'Νεο Αίτημα',
      icon: 'add_circle',
      active: pathname === '/'
    },
    {
      href: `/requests/${clientId}`,
      label: 'Αιτήματα',
      icon: 'home',
      active: isRequestsTabActive('open')
    },
    {
      href: `/requests/${clientId}?tab=appointment`,
      label: 'Ραντεβού',
      icon: 'calendar_month',
      active: isRequestsTabActive('appointment')
    },
    {
      href: `/requests/${clientId}/chats`,
      label: 'Συνομιλίες',
      icon: 'forum',
      active: pathname === `/requests/${clientId}/chats`
    },
    {
      href: `/profile/${clientId}`,
      label: 'Προφίλ',
      icon: 'settings',
      active: pathname === `/profile/${clientId}`
    }
  ]

  return (
    <nav className="bg-surface-container-lowest border-b border-outline-variant/10 sticky top-0 z-50 shadow-[0_1px_8px_rgba(27,28,28,0.04)]">
      <div className={`${styles.container} py-3`}>
        <div className="flex items-center justify-between">
          {/* Logo/Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-primary to-primary-container rounded-xl flex items-center justify-center shadow-md shadow-primary/20">
              <Icon name="person" filled size="sm" className="text-on-primary" />
            </div>
            <div>
              <h1 className="text-base font-bold text-on-surface tracking-tight">NextService</h1>
              <p className={styles.labelUpper}>Πελάτης</p>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all duration-200 whitespace-nowrap uppercase tracking-wide ${
                  item.active
                    ? 'bg-primary text-on-primary shadow-md shadow-primary/20'
                    : 'text-secondary hover:text-on-surface hover:bg-surface-container'
                }`}
              >
                <Icon name={item.icon} filled={item.active} size="sm" />
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  )
}
