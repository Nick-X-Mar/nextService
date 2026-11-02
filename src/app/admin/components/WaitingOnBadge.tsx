import type { RequestWaiting, WaitingOn } from '@/types/adminRequests'

export const WAITING_LABELS: Record<WaitingOn, string> = {
  client: 'Client',
  garage: 'Garage',
  admin: 'Admin',
}

const WAITING_ICONS: Record<WaitingOn, string> = {
  client: 'person',
  garage: 'garage',
  admin: 'support_agent',
}

const WAITING_STYLES: Record<WaitingOn, string> = {
  client: 'bg-blue-100 text-blue-700',
  garage: 'bg-amber-100 text-amber-800',
  admin: 'bg-red-100 text-red-700',
}

export function WaitingOnChip({ on }: { on: WaitingOn }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${WAITING_STYLES[on]}`}>
      <span className="material-symbols-outlined text-[14px]">{WAITING_ICONS[on]}</span>
      {WAITING_LABELS[on]}
    </span>
  )
}

/** How long it has been waiting: `since` is a timestamp, or an appointment's date. */
export function waitingFor(since: string | undefined): string {
  if (!since) return ''
  const minutes = Math.floor((Date.now() - new Date(since).getTime()) / 60000)
  if (minutes < 60) return `${Math.max(minutes, 0)}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function WaitingList({ waiting }: { waiting: RequestWaiting[] }) {
  if (waiting.length === 0) return <span className="text-on-surface/40">-</span>
  return (
    <div className="space-y-1.5 min-w-[13rem]" data-testid="waiting">
      {waiting.map((item, i) => (
        <div key={i}>
          <div className="flex items-center gap-1.5">
            <WaitingOnChip on={item.on} />
            {item.garageName && <span className="text-xs font-medium text-on-surface truncate">{item.garageName}</span>}
            {item.since && <span className="text-xs text-on-surface/50 whitespace-nowrap">{waitingFor(item.since)}</span>}
          </div>
          <p className="text-xs text-on-surface/70 mt-0.5">{item.reason}</p>
        </div>
      ))}
    </div>
  )
}
