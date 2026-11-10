'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import DataTable, { type Column } from '../components/DataTable'
import Modal from '@/components/Modal'
import Spinner from '@/components/Spinner'
import { useAsyncTask } from '@/hooks/useAsyncTask'
import { useToast } from '@/hooks/useToast'
import { DEFAULT_COMMISSION_PERCENT } from '@/lib/commission-basis'

type Tab = 'garages' | 'pending'

const VALID_TABS: Tab[] = ['garages', 'pending']

interface GarageRecord {
  id: string
  email: string
  name: string
  phone: string
  businessTypes: string
  createdAt: string
  isActive?: boolean
  commissionPercent: number
}

export default function GaragesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialTab = searchParams?.get('tab') as Tab | null
  const [tab, setTab] = useState<Tab>(
    initialTab && VALID_TABS.includes(initialTab) ? initialTab : 'garages'
  )
  const [data, setData] = useState<GarageRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let current = true
    async function fetchGarages() {
      setLoading(true)
      try {
        const status = tab === 'pending' ? 'pending' : 'all'
        const res = await fetch(`/api/admin/users/garages/?limit=50&status=${status}&search=${encodeURIComponent(search)}`)
        if (res.ok && current) {
          const json = await res.json()
          setData(json.items || [])
        }
      } catch { /* empty */ }
      if (current) setLoading(false)
    }
    fetchGarages()
    return () => { current = false }
  }, [tab, search])

  const { run, isPending } = useAsyncTask()
  const toast = useToast()

  // The rate is agreed on the approval call, so approving asks for it.
  const [approving, setApproving] = useState<GarageRecord | null>(null)
  const [percent, setPercent] = useState('')

  function openApproval(garage: GarageRecord) {
    setPercent(String(garage.commissionPercent))
    setApproving(garage)
  }

  async function handleActivate(garage: GarageRecord) {
    const agreed = Number(percent)
    if (percent.trim() === '' || !Number.isFinite(agreed) || agreed < 0 || agreed > 100) {
      toast.error('Το ποσοστό πρέπει να είναι από 0 έως 100')
      return
    }
    try {
      const res = await fetch(`/api/admin/users/garages/${garage.id}/activate/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Left at the rate it is already on, nothing was agreed and nothing is stored.
        body: JSON.stringify(agreed === garage.commissionPercent ? {} : { commissionPercent: agreed }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        toast.error(body?.error || 'Η έγκριση απέτυχε')
        return
      }
      setData((prev) => prev.filter((u) => u.id !== garage.id))
      setApproving(null)
      toast.success('Το συνεργείο εγκρίθηκε', `Προμήθεια ${agreed}%`)
    } catch {
      toast.error('Η έγκριση απέτυχε')
    }
  }

  const tabs: { value: Tab; label: string }[] = [
    { value: 'garages', label: 'Garages' },
    { value: 'pending', label: 'Pending Approvals' },
  ]

  const columns: Column<GarageRecord>[] = [
    { key: 'name', header: 'Company', sortable: true },
    { key: 'email', header: 'Email', sortable: true },
    { key: 'phone', header: 'Phone' },
    { key: 'businessTypes', header: 'Τύπος', render: (item: GarageRecord) => item.businessTypes || '-' },
    { key: 'createdAt', header: 'Registered', sortable: true, render: (item: GarageRecord) => new Date(item.createdAt).toLocaleDateString() },
    {
      key: 'commissionPercent',
      header: 'Commission',
      render: (item: GarageRecord) => (
        <Link
          href={`/admin/commissions/${item.id}/`}
          onClick={(e) => e.stopPropagation()}
          className="font-medium text-primary hover:underline"
        >
          {item.commissionPercent}%
        </Link>
      ),
    },
    ...(tab === 'pending' ? [{
      key: 'actions' as const,
      header: 'Actions',
      render: (item: GarageRecord) => (
        <button
          onClick={(e) => { e.stopPropagation(); openApproval(item) }}
          className="inline-flex items-center gap-1.5 bg-primary text-on-primary px-3 py-1 rounded-lg text-xs font-medium hover:bg-primary/90"
        >
          Approve
        </button>
      )
    }] : []),
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold font-headline text-on-surface mb-6">Garages</h1>

      <div className="flex items-center gap-6 mb-4">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.value
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-high text-on-surface/70 hover:bg-surface-container-highest'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="flex-1 max-w-sm px-3.5 py-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest text-sm text-on-surface"
        />
      </div>

      <DataTable
        columns={columns}
        data={data}
        keyField="id"
        loading={loading}
        emptyMessage="No garages found"
        onRowClick={(item) => router.push(`/admin/garages/${item.id}/`)}
      />

      <Modal
        isOpen={approving !== null}
        onClose={() => setApproving(null)}
        title="Έγκριση συνεργείου"
        size="sm"
        footer={approving && (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setApproving(null)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-on-surface/70 hover:bg-surface-container"
            >
              Άκυρο
            </button>
            <button
              type="button"
              onClick={() => run(approving.id, () => handleActivate(approving))}
              disabled={isPending(approving.id)}
              className="inline-flex items-center gap-1.5 bg-primary text-on-primary px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending(approving.id) && <Spinner size="sm" />}
              Έγκριση
            </button>
          </div>
        )}
      >
        {approving && (
          <div className="space-y-3">
            <div>
              <p className="font-bold text-on-surface">{approving.name}</p>
              {approving.phone && (
                <a href={`tel:${approving.phone}`} className="block text-sm text-primary hover:underline">
                  {approving.phone}
                </a>
              )}
              <p className="text-sm text-on-surface/60 break-all">{approving.email}</p>
            </div>
            <div>
              <label htmlFor="approval-percent" className="block text-sm font-medium text-on-surface mb-1">
                Ποσοστό προμήθειας (%)
              </label>
              <input
                id="approval-percent"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="0.01"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                className="w-32 px-3.5 py-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest text-sm text-on-surface"
              />
              <p className="text-xs text-on-surface/50 mt-1">
                Η προεπιλογή είναι {DEFAULT_COMMISSION_PERCENT}%. Αλλάζει αργότερα από τις Προμήθειες, μόνο για τα νέα ραντεβού.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
