'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import { styles } from '../styles/styles'

interface GarageNavigationProps {
  garageId: string
  companyName?: string
}

export default function GarageNavigation({ garageId, companyName }: GarageNavigationProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')

  const isTabActive = (tab: 'requests' | 'offers' | 'appointments' | 'settings') => {
    if (pathname !== `/garage-dashboard/${garageId}`) return false
    return tabParam === tab
  }

  const navItems = [
    {
      href: `/garage-dashboard/${garageId}?tab=requests`,
      label: 'Αιτηματα',
      icon: 'inbox',
      active: isTabActive('requests') || (pathname === `/garage-dashboard/${garageId}` && !tabParam)
    },
    {
      href: `/garage-dashboard/${garageId}?tab=offers`,
      label: 'Προσφορες',
      icon: 'description',
      active: isTabActive('offers')
    },
    {
      href: `/garage-dashboard/${garageId}?tab=appointments`,
      label: 'Ραντεβου',
      icon: 'calendar_month',
      active: isTabActive('appointments')
    },
    {
      href: `/garage-dashboard/${garageId}/chats`,
      label: 'Συνομιλιες',
      icon: 'chat',
      active: pathname === `/garage-dashboard/${garageId}/chats`
    },
    {
      href: `/garage-dashboard/${garageId}/chats/appointments`,
      label: 'Chat Ραντεβου',
      icon: 'forum',
      active: pathname === `/garage-dashboard/${garageId}/chats/appointments`
    },
    {
      href: `/garage-dashboard/${garageId}?tab=settings`,
      label: 'Ρυθμισεις',
      icon: 'settings',
      active: isTabActive('settings')
    }
  ]

  return (
    <nav className="bg-surface-container-lowest border-b border-outline-variant/10 sticky top-0 z-50 shadow-[0_1px_8px_rgba(27,28,28,0.04)]">
      <div className={`${styles.container} py-3`}>
        <div className="flex items-center justify-between gap-4">
          {/* Logo/Brand */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-9 h-9 bg-gradient-to-br from-primary to-primary-container rounded-xl flex items-center justify-center shadow-md shadow-primary/20">
              <Icon name="build" filled size="sm" className="text-on-primary" />
            </div>
            <div>
              <h1 className="text-base font-bold text-on-surface tracking-tight">
                {companyName || 'NextService'}
              </h1>
              <p className={styles.labelUpper}>Συνεργειο</p>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="flex items-center gap-1 flex-wrap max-w-[60%] justify-end">
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
