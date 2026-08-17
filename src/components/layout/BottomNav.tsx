'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Icon from '@/components/ui/Icon'
import { useNotifications } from '@/contexts/NotificationsContext'
import { resolveActiveHref, type ActiveNavItem } from '@/utils/activeNav'

interface NavItem extends ActiveNavItem {
  label: string
  icon: string
  /** How many things wait behind this destination. Hidden when 0. */
  badge?: number
  /** What the badge counts, for screen readers. */
  badgeLabel?: string
}

export default function BottomNav() {
  const { userType, client, garage } = useAuth()
  const { threads, availableRequests, offersNeedingAttention } = useNotifications()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get('tab')

  const clientNavItems: NavItem[] = client ? [
    { label: 'Αρχική', icon: 'home', href: '/', matchPaths: ['/'] },
    { label: 'Αιτήματα', icon: 'build', href: `/requests/${client.id}`, matchPaths: [`/requests/${client.id}`] },
    { label: 'Μηνύματα', icon: 'chat_bubble', href: `/requests/${client.id}/chats`, matchPaths: [`/requests/${client.id}/chats`], badge: threads },
    { label: 'Προφίλ', icon: 'person', href: `/profile/${client.id}`, matchPaths: [`/profile/`] },
  ] : [
    { label: 'Αρχική', icon: 'home', href: '/', matchPaths: ['/'] },
    { label: 'Σύνδεση', icon: 'login', href: '/login', matchPaths: ['/login'] },
  ]

  // Pending validation: the app tabs would all be empty, so the only
  // destination is the application status screen.
  const garagePendingNavItems: NavItem[] = garage ? [
    { label: 'Κατάσταση', icon: 'hourglass_top', href: `/garage-dashboard/${garage.id}`, matchPaths: [`/garage-dashboard/${garage.id}`] },
    { label: 'Αρχική', icon: 'home', href: '/', matchPaths: ['/'] },
  ] : []

  const garageNavItems: NavItem[] = garage ? [
    { label: 'Αιτήματα', icon: 'list_alt', href: `/garage-dashboard/${garage.id}?tab=requests`, matchTab: 'requests', matchPaths: [`/garage-dashboard/${garage.id}`], badge: availableRequests, badgeLabel: 'αιτήματα σε αναμονή προσφοράς' },
    { label: 'Προσφορές', icon: 'local_offer', href: `/garage-dashboard/${garage.id}?tab=offers`, matchTab: 'offers', badge: offersNeedingAttention, badgeLabel: 'προσφορές που περιμένουν κίνηση' },
    { label: 'Ραντεβού', icon: 'calendar_today', href: `/garage-dashboard/${garage.id}?tab=appointments`, matchTab: 'appointments' },
    { label: 'Μηνύματα', icon: 'chat', href: `/garage-dashboard/${garage.id}/chats`, matchPaths: [`/garage-dashboard/${garage.id}/chats`], badge: threads, badgeLabel: 'συνομιλίες με νέα μηνύματα' },
    { label: 'Ρυθμίσεις', icon: 'settings', href: `/garage-dashboard/${garage.id}?tab=settings`, matchTab: 'settings' },
  ] : []

  const navItems = userType === 'garage'
    ? (garage?.isActive ? garageNavItems : garagePendingNavItems)
    : clientNavItems

  const activeHref = resolveActiveHref(navItems, pathname, currentTab)

  // Don't show bottom nav on desktop
  if (!navItems.length) return null

  return (
    <nav className="fixed bottom-0 w-full z-50 md:hidden rounded-t-3xl bg-[#fbf9f8]/80 backdrop-blur-xl border-t border-outline-variant/20 shadow-[0_-4px_20px_0_rgba(0,0,0,0.04)]">
      {/* Each tab takes an equal share (`flex-1 min-w-0`) instead of sizing to
          its label. The garage's five tabs used to add up past the screen on a
          320px phone, pushing Ρυθμίσεις off the right edge entirely; equal
          shares plus a truncating label keep every tab reachable. The active
          pill's padding is horizontal-free for the same reason — it used to add
          32px to whichever tab happened to be selected. */}
      <div className="flex items-center h-20 px-2">
        {navItems.map((item) => {
          const active = item.href === activeHref
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1 mx-0.5 rounded-2xl active:scale-90 duration-200 ${
                active
                  ? 'text-primary bg-primary-container/10'
                  : 'text-on-surface/60 hover:text-primary-container'
              }`}
            >
              <span className="relative">
                <Icon name={item.icon} filled={active} />
                {!!item.badge && item.badge > 0 && (
                  <span
                    aria-label={`${item.badge} ${item.badgeLabel ?? 'νέα'}`}
                    className="absolute -top-1 -right-2 bg-primary text-on-primary text-[9px] font-bold leading-none h-4 min-w-4 px-1 rounded-full flex items-center justify-center"
                  >
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </span>
              {/* Below 360px the garage's five Greek labels don't fit at the
                  normal size, so they drop a point and give up their letter
                  spacing rather than all ending in an ellipsis. From 360px up
                  — every current iPhone and Android — nothing changes. */}
              <span className="font-body text-[9px] tracking-normal min-[360px]:text-[10px] min-[360px]:tracking-[0.05em] uppercase font-bold mt-1 max-w-full truncate">
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
