import Link from 'next/link'

interface StatCardProps {
  icon: string
  label: string
  value: string | number
  subtitle?: string
  trend?: { value: number; label: string }
  color?: 'primary' | 'secondary' | 'tertiary' | 'error'
  /** Makes the whole card a link to what the number counts. */
  href?: string
  /** Makes the whole card a button, for a filter on the same page. */
  onClick?: () => void
  /** The filter this card applies is on. */
  active?: boolean
}

const colorMap = {
  primary: 'bg-primary-container/30 text-on-primary-container',
  secondary: 'bg-secondary-container/50 text-on-secondary-container',
  tertiary: 'bg-tertiary-container/30 text-on-tertiary-container',
  error: 'bg-error-container/30 text-on-error-container',
}

const iconColorMap = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  tertiary: 'text-tertiary',
  error: 'text-error',
}

export default function StatCard({ icon, label, value, subtitle, trend, color = 'primary', href, onClick, active }: StatCardProps) {
  const card = `block w-full text-left bg-surface-container-lowest rounded-xl border p-5 ${
    active ? 'border-primary ring-1 ring-primary' : 'border-outline-variant/20'
  } ${href || onClick ? 'hover:border-primary/50 hover:bg-surface-container-low transition-colors cursor-pointer' : ''}`

  const body = (
    <>
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-lg ${colorMap[color]} flex items-center justify-center`}>
          <span className={`material-symbols-outlined text-[20px] ${iconColorMap[color]}`}>{icon}</span>
        </div>
        {trend && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            trend.value >= 0
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          }`}>
            {trend.value >= 0 ? '+' : ''}{trend.value}% {trend.label}
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-on-surface font-headline">{value}</p>
        <p className="text-sm text-on-surface/60 mt-0.5">{label}</p>
        {subtitle && <p className="text-xs text-on-surface/40 mt-1">{subtitle}</p>}
      </div>
    </>
  )

  if (href) return <Link href={href} className={card}>{body}</Link>
  if (onClick) return <button type="button" onClick={onClick} aria-pressed={active} className={card}>{body}</button>
  return <div className={card}>{body}</div>
}
