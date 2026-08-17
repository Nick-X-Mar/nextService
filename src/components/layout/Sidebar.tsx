'use client'

import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import { useAsyncTask } from '@/hooks/useAsyncTask'
import { useNotifications } from '@/contexts/NotificationsContext'
import { clearFormData } from '@/utils/formStorage'
import { resolveActiveHref, type ActiveNavItem } from '@/utils/activeNav'

interface NavItem extends ActiveNavItem {
  label: string
  icon: string
  /** Unread conversations behind this destination. Hidden when 0. */
  badge?: number
}

export default function Sidebar() {
  const { userType, client, garage, logout } = useAuth()
  const { run, isPending } = useAsyncTask()
  const { threads, openThreads, appointmentThreads } = useNotifications()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get('tab')
  const router = useRouter()

  const clientNavItems: NavItem[] = client ? [
    { label: 'Νέο Αίτημα', icon: 'add_circle', href: '#new-request' },
    { label: 'Αιτήματα', icon: 'build', href: `/requests/${client.id}` },
    { label: 'Ραντεβού', icon: 'calendar_today', href: `/requests/${client.id}?tab=appointment`, matchTab: 'appointment' },
    { label: 'Μηνύματα', icon: 'chat', href: `/requests/${client.id}/chats`, badge: threads },
    { label: 'Προφίλ', icon: 'person', href: `/profile/${client.id}` },
  ] : []

  // A garage still waiting for validation has nothing to do in the app yet —
  // every tab would be empty, so we only point at its application status.
  const garagePendingNavItems: NavItem[] = garage ? [
    { label: 'Κατάσταση Αίτησης', icon: 'hourglass_top', href: `/garage-dashboard/${garage.id}` },
  ] : []

  const garageNavItems: NavItem[] = garage ? [
    { label: 'Νέα Αιτήματα', icon: 'list_alt', href: `/garage-dashboard/${garage.id}?tab=requests`, matchTab: 'requests' },
    { label: 'Προσφορές', icon: 'local_offer', href: `/garage-dashboard/${garage.id}?tab=offers`, matchTab: 'offers' },
    { label: 'Ραντεβού', icon: 'calendar_today', href: `/garage-dashboard/${garage.id}?tab=appointments`, matchTab: 'appointments' },
    { label: 'Ανοιχτές Συνομιλίες', icon: 'chat', href: `/garage-dashboard/${garage.id}/chats`, badge: openThreads },
    { label: 'Συνομιλίες Ραντεβού', icon: 'forum', href: `/garage-dashboard/${garage.id}/chats/appointments`, badge: appointmentThreads },
    { label: 'Ρυθμίσεις', icon: 'settings', href: `/garage-dashboard/${garage.id}?tab=settings`, matchTab: 'settings' },
  ] : []

  const navItems = userType === 'garage'
    ? (garage?.isActive ? garageNavItems : garagePendingNavItems)
    : clientNavItems

  // Same single-winner rule as the mobile BottomNav — without it the nested
  // routes lit two entries at once (Αιτήματα + Μηνύματα on `/requests/x/chats`,
  // and both chat entries on `/garage-dashboard/x/chats/appointments`).
  const activeHref = resolveActiveHref(navItems, pathname, currentTab)
  const isActive = (item: NavItem) => item.href === activeHref

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
        {navItems.map((item) => {
          if (item.href === '#new-request') {
            return (
              <button
                key={item.href}
                onClick={() => { clearFormData(); router.push('/?open=1') }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wider transition-all hover:translate-x-1 duration-200 text-secondary hover:bg-surface-container hover:text-on-surface"
              >
                <Icon name={item.icon} className="" />
                <span className="text-xs">{item.label}</span>
              </button>
            )
          }
          return (
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
              <span className="text-xs flex-1">{item.label}</span>
              {!!item.badge && item.badge > 0 && (
                <span
                  aria-label={`${item.badge} συνομιλίες με νέα μηνύματα`}
                  className="bg-primary text-on-primary text-[10px] font-bold leading-none h-5 min-w-5 px-1.5 rounded-full flex items-center justify-center"
                >
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom actions */}
      <div className="px-4 py-6 border-t border-outline-variant/10">
        <button
          onClick={() => run(logout)}
          disabled={isPending()}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold text-secondary hover:text-tertiary hover:bg-surface-container transition-colors disabled:opacity-60"
        >
          {isPending() ? <Spinner size="md" /> : <Icon name="logout" />}
          <span className="text-xs uppercase tracking-wider">
            {isPending() ? 'Αποσύνδεση…' : 'Αποσύνδεση'}
          </span>
        </button>
      </div>
    </aside>
  )
}
