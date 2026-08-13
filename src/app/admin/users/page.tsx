'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import DataTable, { type Column } from '../components/DataTable'

interface ClientRecord {
  id: string
  email: string
  name: string
  phone: string
  createdAt: string
  isActive?: boolean
}

export default function UsersPage() {
  const router = useRouter()
  const [data, setData] = useState<ClientRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function fetchClients() {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/users/clients/?limit=50&search=${encodeURIComponent(search)}`)
        if (res.ok) {
          const json = await res.json()
          setData(json.items || [])
        }
      } catch { /* empty */ }
      setLoading(false)
    }
    fetchClients()
  }, [search])

  const columns: Column<ClientRecord>[] = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'email', header: 'Email', sortable: true },
    { key: 'phone', header: 'Phone' },
    { key: 'createdAt', header: 'Registered', sortable: true, render: (item: ClientRecord) => new Date(item.createdAt).toLocaleDateString() },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold font-headline text-on-surface mb-6">Clients</h1>

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="w-full max-w-sm px-3.5 py-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest text-sm text-on-surface"
        />
      </div>

      <DataTable
        columns={columns}
        data={data}
        keyField="id"
        loading={loading}
        emptyMessage="No clients found"
        onRowClick={(item) => router.push(`/admin/users/${item.id}/`)}
      />
    </div>
  )
}
