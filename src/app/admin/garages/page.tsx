'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import DataTable, { type Column } from '../components/DataTable'

type Tab = 'garages' | 'pending'

const VALID_TABS: Tab[] = ['garages', 'pending']

interface GarageRecord {
  id: string
  email: string
  name: string
  phone: string
  createdAt: string
  isActive?: boolean
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
    async function fetchGarages() {
      setLoading(true)
      try {
        const status = tab === 'pending' ? 'pending' : 'all'
        const res = await fetch(`/api/admin/users/garages?limit=50&status=${status}&search=${encodeURIComponent(search)}`)
        if (res.ok) {
          const json = await res.json()
          setData(json.items || [])
        }
      } catch { /* empty */ }
      setLoading(false)
    }
    fetchGarages()
  }, [tab, search])

  async function handleActivate(garageId: string) {
    try {
      const res = await fetch(`/api/admin/users/garages/${garageId}/activate`, { method: 'POST' })
      if (res.ok) {
        setData((prev) => prev.filter((u) => u.id !== garageId))
      }
    } catch { /* empty */ }
  }

  const tabs: { value: Tab; label: string }[] = [
    { value: 'garages', label: 'Garages' },
    { value: 'pending', label: 'Pending Approvals' },
  ]

  const columns: Column<GarageRecord>[] = [
    { key: 'name', header: 'Company', sortable: true },
    { key: 'email', header: 'Email', sortable: true },
    { key: 'phone', header: 'Phone' },
    { key: 'createdAt', header: 'Registered', sortable: true, render: (item: GarageRecord) => new Date(item.createdAt).toLocaleDateString() },
    ...(tab === 'pending' ? [{
      key: 'actions' as const,
      header: 'Actions',
      render: (item: GarageRecord) => (
        <button
          onClick={(e) => { e.stopPropagation(); handleActivate(item.id) }}
          className="bg-primary text-on-primary px-3 py-1 rounded-lg text-xs font-medium hover:bg-primary/90"
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
        onRowClick={(item) => router.push(`/admin/users/${item.id}/`)}
      />
    </div>
  )
}
