'use client'

interface CohortRow {
  month: string
  registered: number
  requested1Plus: number
  requested2Plus: number
  requested3Plus: number
  completed1Plus: number
}

interface CohortTableProps {
  cohorts: CohortRow[]
}

// Returns a Tailwind background colour intensity proportional to the rate.
// Used to render the heatmap cells.
function heatmapClass(rate: number): string {
  if (rate >= 0.6) return 'bg-emerald-500/80 text-white'
  if (rate >= 0.4) return 'bg-emerald-400/70 text-white'
  if (rate >= 0.25) return 'bg-emerald-300/60 text-on-surface'
  if (rate >= 0.1) return 'bg-emerald-200/60 text-on-surface'
  if (rate > 0) return 'bg-emerald-100/60 text-on-surface'
  return 'bg-surface-container text-secondary'
}

function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split('-')
  const months = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ']
  const idx = parseInt(month, 10) - 1
  return `${months[idx] || month} ${year}`
}

function Cell({ count, total }: { count: number; total: number }) {
  const rate = total > 0 ? count / total : 0
  return (
    <td className={`px-3 py-2 text-center text-xs font-semibold ${heatmapClass(rate)}`}>
      <div>{count.toLocaleString('el-GR')}</div>
      {total > 0 && (
        <div className="text-[10px] opacity-80 font-normal">
          {(rate * 100).toFixed(1)}%
        </div>
      )}
    </td>
  )
}

export default function CohortTable({ cohorts }: CohortTableProps) {
  if (!cohorts.length) {
    return (
      <div className="text-sm text-secondary py-8 text-center">
        Δεν υπάρχουν cohorts στο επιλεγμένο διάστημα.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-outline-variant/40">
            <th className="text-left px-3 py-2 font-semibold text-on-surface">Cohort</th>
            <th className="text-center px-3 py-2 font-semibold text-on-surface">Εγγραφές</th>
            <th className="text-center px-3 py-2 font-semibold text-on-surface">≥1 Αίτημα</th>
            <th className="text-center px-3 py-2 font-semibold text-on-surface">≥2 Αιτήματα</th>
            <th className="text-center px-3 py-2 font-semibold text-on-surface">≥3 Αιτήματα</th>
            <th className="text-center px-3 py-2 font-semibold text-on-surface">≥1 Ολοκλήρωση</th>
          </tr>
        </thead>
        <tbody>
          {cohorts.map((row) => (
            <tr key={row.month} className="border-b border-outline-variant/20">
              <td className="px-3 py-2 text-on-surface font-medium">
                {formatMonth(row.month)}
              </td>
              <td className="px-3 py-2 text-center text-on-surface font-semibold">
                {row.registered.toLocaleString('el-GR')}
              </td>
              <Cell count={row.requested1Plus} total={row.registered} />
              <Cell count={row.requested2Plus} total={row.registered} />
              <Cell count={row.requested3Plus} total={row.registered} />
              <Cell count={row.completed1Plus} total={row.registered} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
