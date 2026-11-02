'use client'

import { useState } from 'react'
import Spinner from '@/components/Spinner'
import { useAsyncTask } from '@/hooks/useAsyncTask'

export interface CommissionRate {
  commissionPercent: number
  hasCustomRate: boolean
  defaultCommissionPercent: number
  rateSetAt?: string
  rateSetBy?: string
}

export type RateFields = Omit<CommissionRate, 'defaultCommissionPercent'>

export function formatPercent(value: number): string {
  return value.toLocaleString('el-GR', { maximumFractionDigits: 2 }) + '%'
}

/**
 * The garage's agreed rate. A change applies to the bookings made from now on:
 * every job keeps the rate it was booked at, so nothing already billed moves.
 */
export default function CommissionRateCard({
  garageId,
  data,
  onSaved,
}: {
  garageId: string
  data: CommissionRate
  onSaved: (rate: RateFields) => void
}) {
  const { run, isPending } = useAsyncTask()
  const [value, setValue] = useState(data.hasCustomRate ? String(data.commissionPercent) : '')
  const [error, setError] = useState('')

  const save = (commissionPercent: number | null) =>
    run(commissionPercent === null ? 'reset' : 'save', async () => {
      setError('')
      const res = await fetch(`/api/admin/commissions/garage/${garageId}/rate/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commissionPercent }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || 'Η αποθήκευση απέτυχε')
        return
      }
      if (commissionPercent === null) setValue('')
      onSaved(json as RateFields)
    })

  const parsed = Number(value.replace(',', '.'))
  const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= 100

  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 mb-6" data-testid="commission-rate">
      <h3 className="font-bold text-on-surface">Ποσοστό προμήθειας</h3>
      <p className="text-sm text-on-surface/60 mt-1">
        Τρέχον: <span className="font-semibold text-on-surface">{formatPercent(data.commissionPercent)}</span>{' '}
        {data.hasCustomRate ? '(συμφωνημένο)' : `(προεπιλογή ${formatPercent(data.defaultCommissionPercent)})`}
        {data.rateSetAt && (
          <> · αλλαγή {new Date(data.rateSetAt).toLocaleDateString('el-GR')}{data.rateSetBy ? ` από ${data.rateSetBy}` : ''}</>
        )}
      </p>
      <p className="text-xs text-on-surface/50 mt-1">
        Ισχύει για τα νέα ραντεβού. Όσα έχουν ήδη κλειστεί κρατούν το ποσοστό με το οποίο κλείστηκαν.
      </p>
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <div className="relative">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={0.5}
            aria-label="Ποσοστό προμήθειας"
            placeholder={String(data.defaultCommissionPercent)}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-28 bg-surface-container-highest border-none rounded-lg px-3 py-2 pr-8 text-sm font-medium text-on-surface focus:ring-2 focus:ring-primary/20"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-on-surface/50">%</span>
        </div>
        <button
          onClick={() => save(Math.round(parsed * 100) / 100)}
          disabled={!valid || isPending()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-on-primary px-4 py-2 text-sm font-bold disabled:opacity-50 active:scale-95 transition-transform"
        >
          {isPending('save') && <Spinner size="sm" />}
          Αποθήκευση
        </button>
        {data.hasCustomRate && (
          <button
            onClick={() => save(null)}
            disabled={isPending()}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
          >
            {isPending('reset') && <Spinner size="sm" />}
            Επαναφορά στην προεπιλογή
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-error mt-2">{error}</p>}
    </div>
  )
}
