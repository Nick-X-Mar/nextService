'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Spinner from '@/components/Spinner'
import { useAsyncTask } from '@/hooks/useAsyncTask'
import { useConfirm } from '@/hooks/useConfirm'
import { useNavigation } from '@/hooks/useNavigation'
import { useToast } from '@/hooks/useToast'
import { SETTLEMENT_STATUS_LABELS, settlementMethodLabel, type GarageLedger, type LedgerJob } from '@/types/settlements'
import { euro } from '@/utils/money'
import CommissionRateCard, { formatPercent, type CommissionRate } from '../../components/CommissionRateCard'
import DataTable, { type Column } from '../../components/DataTable'
import StatCard from '../../components/StatCard'

interface GarageDetail {
  id: string
  email: string
  name: string
  companyName: string
  contactFirstName: string
  contactLastName: string
  phone: string
  tin: string
  taxAuthority: string
  address: string
  area: string
  municipality: string
  description: string
  benefits: string[]
  workdayStartTime: string
  workdayEndTime: string
  createdAt: string
  activatedAt: string
  deactivatedAt: string
  isActive: boolean
  offerCount: number
  rate: CommissionRate
  ledger: GarageLedger
}

const FIELDS: { key: string; label: string; wide?: boolean }[] = [
  { key: 'companyName', label: 'Επωνυμία' },
  { key: 'contactFirstName', label: 'Όνομα υπευθύνου' },
  { key: 'contactLastName', label: 'Επώνυμο υπευθύνου' },
  { key: 'email', label: 'Email' },
  { key: 'mobile', label: 'Κινητό' },
  { key: 'tin', label: 'ΑΦΜ' },
  { key: 'taxAuthority', label: 'ΔΟΥ' },
  { key: 'address', label: 'Διεύθυνση' },
  { key: 'area', label: 'Περιοχή' },
  { key: 'municipality', label: 'Δήμος' },
  { key: 'description', label: 'Περιγραφή', wide: true },
]

const JOB_STATES: Record<LedgerJob['state'], { label: string; className: string }> = {
  upcoming: { label: 'Ραντεβού', className: 'bg-blue-100 text-blue-700' },
  awaiting: { label: 'Περιμένει δήλωση', className: 'bg-yellow-100 text-yellow-700' },
  completed: { label: 'Εκτελέστηκε', className: 'bg-green-100 text-green-700' },
  not_done: { label: 'Δεν έγινε', className: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Ακυρώθηκε', className: 'bg-red-100 text-red-700' },
}

const jobColumns: Column<LedgerJob>[] = [
  { key: 'appointmentDate', header: 'Ραντεβού', render: (job) => <span className="whitespace-nowrap">{job.appointmentDate || '-'}</span> },
  { key: 'vehicle', header: 'Όχημα', render: (job) => job.vehicle || '-' },
  {
    key: 'state',
    header: 'Κατάσταση',
    render: (job) => (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${JOB_STATES[job.state].className}`}>
        {JOB_STATES[job.state].label}
      </span>
    ),
  },
  { key: 'quoted', header: 'Προσφορά', render: (job) => (job.quoted === null ? '-' : euro(job.quoted)) },
  { key: 'declared', header: 'Τελικό', render: (job) => (job.declared ? euro(job.declared.net) : '-') },
  {
    key: 'commission',
    header: 'Προμήθεια',
    render: (job) => <span className="whitespace-nowrap">{euro(job.commission)} ({formatPercent(job.commissionPercent)})</span>,
  },
]

function accountState(garage: GarageDetail): { label: string; className: string } {
  if (garage.isActive) return { label: 'Ενεργό', className: 'bg-green-100 text-green-700' }
  if (garage.deactivatedAt) return { label: 'Απενεργοποιημένο', className: 'bg-red-100 text-red-700' }
  return { label: 'Περιμένει έγκριση', className: 'bg-yellow-100 text-yellow-700' }
}

export default function GarageDetailPage() {
  const { garageId } = useParams<{ garageId: string }>()
  const { navigate, isNavigating } = useNavigation()
  const { run, isPending } = useAsyncTask()
  const confirm = useConfirm()
  const toast = useToast()
  const [garage, setGarage] = useState<GarageDetail | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/users/garages/${garageId}/`)
      if (res.ok) {
        const data: GarageDetail = await res.json()
        setGarage(data)
        setForm({
          companyName: data.companyName,
          contactFirstName: data.contactFirstName,
          contactLastName: data.contactLastName,
          email: data.email,
          mobile: data.phone,
          tin: data.tin,
          taxAuthority: data.taxAuthority,
          address: data.address,
          area: data.area,
          municipality: data.municipality,
          description: data.description,
        })
      }
    } catch { /* the not-found state below covers it */ }
    setLoading(false)
  }, [garageId])

  useEffect(() => { load() }, [load])

  const saveDetails = () => run('save', async () => {
    const res = await fetch(`/api/admin/users/garages/${garageId}/`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      toast.error(body?.error || 'Η αποθήκευση απέτυχε')
      return
    }
    toast.success('Τα στοιχεία αποθηκεύτηκαν')
    await load()
  })

  const setActive = (active: boolean) => run('active', async () => {
    if (!active) {
      const ok = await confirm({
        title: 'Απενεργοποίηση συνεργείου',
        message: 'Δεν θα βλέπει νέα αιτήματα. Τα ραντεβού που έχει ήδη κλείσει ισχύουν.',
      })
      if (!ok) return
    }
    const res = await fetch(`/api/admin/users/garages/${garageId}/${active ? 'activate' : 'deactivate'}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (!res.ok) {
      toast.error('Η ενέργεια απέτυχε')
      return
    }
    await load()
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-primary">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!garage) {
    return (
      <div className="text-center py-20">
        <p className="text-on-surface/60">Το συνεργείο δεν βρέθηκε</p>
        <Link href="/admin/garages/" className="text-primary text-sm mt-2 inline-block">Πίσω στα συνεργεία</Link>
      </div>
    )
  }

  const state = accountState(garage)
  const { jobs, settlements, totals } = garage.ledger
  const done = jobs.filter((job) => job.state === 'completed').length

  return (
    <div>
      <Link href="/admin/garages/" className="inline-flex items-center gap-1 text-sm text-on-surface/60 hover:text-on-surface mb-4">
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Πίσω στα συνεργεία
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold font-headline text-on-surface flex items-center gap-3 flex-wrap">
            {garage.name}
            {isNavigating() && <Spinner size="sm" className="text-primary" />}
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${state.className}`}>{state.label}</span>
          </h1>
          <p className="text-sm text-on-surface/60 mt-1">
            {garage.phone && <a href={`tel:${garage.phone}`} className="text-primary hover:underline">{garage.phone}</a>}
            {garage.phone && ' · '}
            <a href={`mailto:${garage.email}`} className="hover:underline break-all">{garage.email}</a>
          </p>
          <p className="text-xs text-on-surface/50 mt-1">
            Εγγραφή {new Date(garage.createdAt).toLocaleDateString('el-GR')}
            {garage.activatedAt && ` · Έγκριση ${new Date(garage.activatedAt).toLocaleDateString('el-GR')}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setActive(!garage.isActive)}
          disabled={isPending('active')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50 ${
            garage.isActive ? 'bg-surface-container-high text-on-surface' : 'bg-primary text-on-primary'
          }`}
        >
          {isPending('active') && <Spinner size="sm" />}
          {garage.isActive ? 'Απενεργοποίηση' : 'Ενεργοποίηση'}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
        <StatCard icon="local_offer" label="Προσφορές" value={garage.offerCount} color="primary" />
        <StatCard icon="check_circle" label="Εκτελεσμένες εργασίες" value={done} color="primary" />
        <StatCard icon="percent" label="Προμήθεια συνολικά" value={euro(totals.commission)} color="secondary" href={`/admin/commissions/${garage.id}/`} />
        <StatCard icon="payments" label="Πληρωμές" value={euro(totals.paid)} subtitle={totals.paidUnconfirmed > 0 ? `${euro(totals.paidUnconfirmed)} σε έλεγχο` : undefined} color="secondary" />
        <StatCard icon="account_balance_wallet" label="Υπόλοιπο προς NextService" value={euro(totals.balance)} color={totals.balance > 0 ? 'error' : 'primary'} />
      </div>

      <CommissionRateCard
        key={`${garage.rate.commissionPercent}-${garage.rate.hasCustomRate}`}
        garageId={garage.id}
        data={garage.rate}
        onSaved={(rate) => setGarage({ ...garage, rate: { ...garage.rate, ...rate } })}
      />

      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 mb-6">
        <h3 className="font-bold text-on-surface mb-4">Στοιχεία συνεργείου</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FIELDS.map((field) => (
            <label key={field.key} className={`block ${field.wide ? 'sm:col-span-2' : ''}`}>
              <span className="block text-xs text-on-surface/60 mb-1">{field.label}</span>
              <input
                type="text"
                value={form[field.key] ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest text-sm text-on-surface"
              />
            </label>
          ))}
        </div>
        {garage.benefits.length > 0 && (
          <p className="text-sm text-on-surface/70 mt-3">Παροχές: {garage.benefits.join(' · ')}</p>
        )}
        {garage.workdayStartTime && (
          <p className="text-sm text-on-surface/70 mt-1">Ωράριο: {garage.workdayStartTime} - {garage.workdayEndTime}</p>
        )}
        <button
          type="button"
          onClick={saveDetails}
          disabled={isPending('save')}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-on-primary px-4 py-2 text-sm font-bold disabled:opacity-50 mt-4"
        >
          {isPending('save') && <Spinner size="sm" />}
          Αποθήκευση στοιχείων
        </button>
      </div>

      <h3 className="font-bold text-on-surface mb-3">Εργασίες ({jobs.length})</h3>
      <div className="mb-6" data-testid="garage-jobs">
        <DataTable
          columns={jobColumns}
          data={jobs}
          keyField="requestId"
          emptyMessage="Δεν έχει κλείσει καμία εργασία ακόμα"
          onRowClick={(job) => navigate(`/admin/requests/${job.requestId}/`)}
        />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h3 className="font-bold text-on-surface">Πληρωμές ({settlements.length})</h3>
        <Link href={`/admin/commissions/${garage.id}/`} className="text-sm font-medium text-primary hover:underline">
          Προμήθειες ανά μήνα και έλεγχος πληρωμών
        </Link>
      </div>
      {settlements.length === 0 ? (
        <p className="text-sm text-on-surface/50">Δεν έχει δηλώσει καμία πληρωμή</p>
      ) : (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 divide-y divide-outline-variant/10">
          {settlements.map((s) => (
            <div key={s.settlementId} className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-medium text-on-surface">{euro(s.amount)}</p>
                <p className="text-xs text-on-surface/60">{s.paidOn} · {settlementMethodLabel(s.method)}{s.reference ? ` · ${s.reference}` : ''}</p>
              </div>
              <span className="text-xs text-on-surface/70">{SETTLEMENT_STATUS_LABELS[s.status]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
