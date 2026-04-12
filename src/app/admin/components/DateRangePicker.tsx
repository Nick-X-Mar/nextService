'use client'

interface DateRangePickerProps {
  from: string
  to: string
  onChange: (from: string, to: string) => void
  presets?: boolean
}

const presetRanges = [
  { label: 'Today', days: 0 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
]

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

export default function DateRangePicker({ from, to, onChange, presets = true }: DateRangePickerProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {presets && (
        <div className="flex gap-1">
          {presetRanges.map((p) => {
            const presetFrom = daysAgo(p.days)
            const presetTo = today()
            const isActive = from === presetFrom && to === presetTo
            return (
              <button
                key={p.label}
                onClick={() => onChange(presetFrom, presetTo)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-high text-on-surface/70 hover:bg-surface-container-highest'
                }`}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={from}
          onChange={(e) => onChange(e.target.value, to)}
          className="px-3 py-1.5 rounded-lg border border-outline-variant/30 bg-surface-container-lowest text-sm text-on-surface"
        />
        <span className="text-on-surface/40 text-sm">to</span>
        <input
          type="date"
          value={to}
          onChange={(e) => onChange(from, e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-outline-variant/30 bg-surface-container-lowest text-sm text-on-surface"
        />
      </div>
    </div>
  )
}
