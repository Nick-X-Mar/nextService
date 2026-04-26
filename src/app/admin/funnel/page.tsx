'use client'

import { useEffect, useState, useCallback } from 'react'
import DateRangePicker from '../components/DateRangePicker'
import FunnelChart from './components/FunnelChart'
import RequestSankey from './components/RequestSankey'
import CohortTable from './components/CohortTable'

interface FunnelStep {
  key: string
  label: string
  count: number
  percentOfFirst: number
  percentOfPrev: number
}

interface FunnelResponse {
  from: string
  to: string
  steps: FunnelStep[]
}

interface SankeyResponse {
  from: string
  to: string
  totalRequests: number
  nodes: { name: string }[]
  links: { source: number; target: number; value: number }[]
}

interface CohortRow {
  month: string
  registered: number
  requested1Plus: number
  requested2Plus: number
  requested3Plus: number
  completed1Plus: number
}

interface CohortsResponse {
  months: number
  cohorts: CohortRow[]
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

interface SectionState<T> {
  loading: boolean
  data: T | null
  error: string | null
}

const initialState = <T,>(): SectionState<T> => ({ loading: true, data: null, error: null })

export default function FunnelPage() {
  // Default to last 7 days. Sankey uses its own default (30d) when from/to
  // omitted, but we always pass the picker value so it's consistent.
  const [from, setFrom] = useState(daysAgo(7))
  const [to, setTo] = useState(today())

  const [client, setClient] = useState<SectionState<FunnelResponse>>(initialState)
  const [garage, setGarage] = useState<SectionState<FunnelResponse>>(initialState)
  const [sankey, setSankey] = useState<SectionState<SankeyResponse>>(initialState)
  const [cohorts, setCohorts] = useState<SectionState<CohortsResponse>>(initialState)

  const fetchSection = useCallback(async <T,>(
    url: string,
    setter: (s: SectionState<T>) => void
  ) => {
    setter({ loading: true, data: null, error: null })
    try {
      const res = await fetch(url)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setter({ loading: false, data: null, error: body.error || `HTTP ${res.status}` })
        return
      }
      const data = (await res.json()) as T
      setter({ loading: false, data, error: null })
    } catch (err) {
      setter({ loading: false, data: null, error: err instanceof Error ? err.message : 'Network error' })
    }
  }, [])

  useEffect(() => {
    const qs = `?from=${from}&to=${to}`
    fetchSection<FunnelResponse>(`/api/admin/funnel/client${qs}`, setClient)
    fetchSection<FunnelResponse>(`/api/admin/funnel/garage${qs}`, setGarage)
    fetchSection<SankeyResponse>(`/api/admin/funnel/sankey${qs}`, setSankey)
  }, [from, to, fetchSection])

  // Cohorts use a months count instead of from/to. Refresh independently.
  useEffect(() => {
    fetchSection<CohortsResponse>('/api/admin/funnel/cohorts?months=6', setCohorts)
  }, [fetchSection])

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold font-headline text-on-surface">Funnel & Analytics</h1>
        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />
      </div>

      <Section title="Πελάτες — Conversion Funnel" subtitle="Μοναδικοί πελάτες ανά βήμα στο επιλεγμένο διάστημα.">
        <SectionBody state={client}>
          {(d) => <FunnelChart steps={d.steps} />}
        </SectionBody>
      </Section>

      <Section title="Συνεργεία — Conversion Funnel" subtitle="Μοναδικά συνεργεία ανά βήμα στο επιλεγμένο διάστημα.">
        <SectionBody state={garage}>
          {(d) => <FunnelChart steps={d.steps} />}
        </SectionBody>
      </Section>

      <Section
        title="Request Lifecycle (Sankey)"
        subtitle={
          sankey.data
            ? `Ροή ${sankey.data.totalRequests.toLocaleString('el-GR')} αιτημάτων στο επιλεγμένο διάστημα.`
            : 'Ροή αιτημάτων.'
        }
      >
        <SectionBody state={sankey}>
          {(d) => <RequestSankey nodes={d.nodes} links={d.links} />}
        </SectionBody>
      </Section>

      <Section
        title="Cohort Retention"
        subtitle="Πελάτες ανά μήνα εγγραφής, και πόσοι έκαναν N+ αιτήματα μέχρι σήμερα. Τελευταίοι 6 μήνες."
      >
        <SectionBody state={cohorts}>
          {(d) => <CohortTable cohorts={d.cohorts} />}
        </SectionBody>
      </Section>
    </div>
  )
}

function Section({
  title,
  subtitle,
  children
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-on-surface">{title}</h2>
        {subtitle && <p className="text-xs text-secondary mt-1">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function SectionBody<T>({
  state,
  children
}: {
  state: SectionState<T>
  children: (data: T) => React.ReactNode
}) {
  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    )
  }
  if (state.error) {
    return (
      <div className="text-sm text-red-600 py-6 text-center">
        Σφάλμα φόρτωσης: {state.error}
      </div>
    )
  }
  if (!state.data) {
    return <div className="text-sm text-secondary py-6 text-center">Δεν υπάρχουν δεδομένα.</div>
  }
  return <>{children(state.data)}</>
}
