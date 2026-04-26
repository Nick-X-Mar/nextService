'use client'

interface FunnelStep {
  key: string
  label: string
  count: number
  percentOfFirst: number
  percentOfPrev: number
}

interface FunnelChartProps {
  steps: FunnelStep[]
  emptyLabel?: string
}

export default function FunnelChart({ steps, emptyLabel = 'Δεν υπάρχουν δεδομένα για αυτή την περίοδο.' }: FunnelChartProps) {
  if (!steps.length || steps[0].count === 0) {
    return (
      <div className="text-sm text-secondary py-8 text-center">{emptyLabel}</div>
    )
  }

  return (
    <div className="space-y-2">
      {steps.map((step, i) => {
        // Cap bar width at 100% — in absolute funnels the count for a later
        // step CAN exceed the entry step (e.g. carry-over from prior periods)
        // and a > 100% bar would overflow visually.
        const widthPct = Math.max(2, Math.min(100, step.percentOfFirst))
        const isBigDrop = i > 0 && step.percentOfPrev < 50 && step.count > 0
        const isOverhang = i > 0 && step.percentOfPrev > 100
        return (
          <div key={step.key} className="flex items-center gap-3">
            <div className="w-56 shrink-0 text-sm text-on-surface font-medium">
              {step.label}
            </div>
            <div className="flex-1 relative h-9 bg-surface-container rounded-md overflow-hidden">
              <div
                className={`h-full ${isBigDrop ? 'bg-red-500/80' : isOverhang ? 'bg-amber-500/80' : 'bg-primary'} transition-all`}
                style={{ width: `${widthPct}%` }}
              />
              <div className="absolute inset-0 flex items-center px-3 text-xs font-semibold text-on-surface">
                <span className="mix-blend-difference text-white">
                  {step.count.toLocaleString('el-GR')}
                </span>
              </div>
            </div>
            <div className="w-32 shrink-0 text-right text-xs">
              <div className="font-bold text-on-surface">{step.percentOfFirst.toFixed(1)}%</div>
              {i > 0 && (
                <div className={isBigDrop ? 'text-red-600' : isOverhang ? 'text-amber-600' : 'text-secondary'} title={isOverhang ? 'Carry-over from prior periods' : undefined}>
                  {isOverhang
                    ? `↑ ${step.percentOfPrev.toFixed(0)}% prev`
                    : `${step.percentOfPrev.toFixed(1)}% prev`}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
