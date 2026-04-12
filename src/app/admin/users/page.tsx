'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import DataTable, { type Column } from '../components/DataTable'

type Tab = 'clients' | 'garages' | 'pending'

interface UserRecord {
  id: string
  email: string
  name: string
  phone: string
  createdAt: string
  isActive?: boolean
}

export default function UsersPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('clients')
  const [data, setData] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function fetchUsers() {
      setLoading(true)
      try {
        const endpoint = tab === 'clients'
          ? `/api/admin/users/clients?limit=50&search=${encodeURIComponent(search)}`
          : `/api/admin/users/garages?limit=50&status=${tab === 'pending' ? 'pending' : 'all'}&search=${encodeURIComponent(search)}`

        const res = await fetch(endpoint)
        if (res.ok) {
          const json = await res.json()
          setData(json.items || [])
        }
      } catch { /* empty */ }
      setLoading(false)
    }
    fetchUsers()
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
    { value: 'clients', label: 'Clients' },
    { value: 'garages', label: 'Garages' },
    { value: 'pending', label: 'Pending Approvals' },
  ]

  const clientColumns: Column<UserRecord>[] = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'email', header: 'Email', sortable: true },
    { key: 'phone', header: 'Phone' },
    { key: 'createdAt', header: 'Registered', sortable: true, render: (item: UserRecord) => new Date(item.createdAt).toLocaleDateString() },
  ]

  const garageColumns: Column<UserRecord>[] = [
    { key: 'name', header: 'Company', sortable: true },
    { key: 'email', header: 'Email', sortable: true },
    { key: 'phone', header: 'Phone' },
    { key: 'createdAt', header: 'Registered', sortable: true, render: (item: UserRecord) => new Date(item.createdAt).toLocaleDateString() },
    ...(tab === 'pending' ? [{
      key: 'actions' as const,
      header: 'Actions',
      render: (item: UserRecord) => (
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
      <h1 className="text-2xl font-bold font-headline text-on-surface mb-6">User Management</h1>

      {/* Tabs */}
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
        columns={tab === 'clients' ? clientColumns : garageColumns}
        data={data}
        keyField="id"
        loading={loading}
        emptyMessage={`No ${tab === 'clients' ? 'clients' : 'garages'} found`}
        onRowClick={(item) => router.push(`/admin/users/${item.id}`)}
      />
    </div>
  )
}
