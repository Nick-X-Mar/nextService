'use client'

import { getCategoryText } from '@/utils/categoryLabels'

export interface FormFieldsStep {
  step: string
  label: string
  started: number
  fields: { field: string; label: string; count: number; percent: number }[]
  completed: { label: string; count: number; percent: number }
}

interface FormFieldsTableProps {
  steps: FormFieldsStep[]
  categories: string[]
  category: string
  onCategoryChange: (category: string) => void
}

/**
 * Each step of the request form, field by field: of the visits that opened the
 * step, how many filled each field. A field far below the one before it is
 * where people stop.
 */
export default function FormFieldsTable({ steps, categories, category, onCategoryChange }: FormFieldsTableProps) {
  return (
    <div className="space-y-5">
      <label className="flex items-center gap-2 text-xs text-on-surface/70">
        Εργασία
        <select
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-2 py-1 text-sm text-on-surface"
        >
          <option value="">Όλες</option>
          {categories.map((c) => (
            <option key={c} value={c}>{getCategoryText(c)}</option>
          ))}
        </select>
      </label>

      <div className="grid gap-5 lg:grid-cols-2">
        {steps.map((step) => (
          <div key={step.step} className="rounded-xl border border-outline-variant/20 overflow-hidden">
            <div className="px-4 py-2 bg-surface-container-low flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-on-surface">{step.label}</h3>
              <span className="text-xs text-on-surface/60">{step.started} επισκέψεις άνοιξαν το βήμα</span>
            </div>
            {step.started === 0 ? (
              <p className="px-4 py-6 text-sm text-secondary text-center">Καμία επίσκεψη σε αυτό το διάστημα.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {[...step.fields, { ...step.completed, field: '__done' }].map((row) => (
                    <tr key={row.field} className={`border-t border-outline-variant/10 ${row.field === '__done' ? 'font-semibold' : ''}`}>
                      <td className="px-4 py-2 text-on-surface">{row.label}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-on-surface/80 w-14">{row.count}</td>
                      <td className="px-4 py-2 w-40">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-surface-container-high overflow-hidden">
                            <div
                              className={`h-full rounded-full ${row.field === '__done' ? 'bg-green-600' : 'bg-primary'}`}
                              style={{ width: `${Math.min(100, row.percent)}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-on-surface/60 w-11 text-right">{row.percent}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
