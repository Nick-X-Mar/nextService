'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Spinner from '@/components/Spinner'
import { useNavigation } from '@/hooks/useNavigation'
import DataTable, { type Column } from '../components/DataTable'
import Pager from '../components/Pager'

interface ClientRecord {
  id: string
  email: string
  name: string
  phone: string
  createdAt: string
  requestCount: number
}

interface ClientList {
  items: ClientRecord[]
  total: number
  page: number
  pageSize: number
}

export default function UsersPage() {
  const { navigate, isNavigating } = useNavigation()
  const [data, setData] = useState<ClientList | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let current = true
    async function fetchClients() {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/users/clients/?page=${page}&search=${encodeURIComponent(appliedSearch)}`)
        if (res.ok && current) setData(await res.json())
      } catch { /* empty */ }
      if (current) setLoading(false)
    }
    fetchClients()
    return () => { current = false }
  }, [appliedSearch, page])

  const columns: Column<ClientRecord>[] = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'email', header: 'Email', sortable: true },
    { key: 'phone', header: 'Phone' },
    {
      key: 'requestCount',
      header: 'Requests',
      render: (item: ClientRecord) => item.requestCount > 0 ? (
        <Link
          href={`/admin/requests/?clientId=${item.id}`}
          onClick={(e) => e.stopPropagation()}
          className="font-medium text-primary hover:underline"
        >
          {item.requestCount}
        </Link>
      ) : 0,
    },
    {
      key: 'createdAt',
      header: 'Registered',
      sortable: true,
      render: (item: ClientRecord) => (item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '-'),
    },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold font-headline text-on-surface mb-6 flex items-center gap-3">
        Clients
        {data && <span className="text-sm font-normal text-on-surface/50">{data.total}</span>}
        {/* Row clicks navigate; the table has no per-row control to spin. */}
        {isNavigating() && <Spinner size="sm" className="text-primary" />}
      </h1>

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email or phone..."
          className="w-full max-w-sm px-3.5 py-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest text-sm text-on-surface"
        />
      </div>

      <div className={loading && data ? 'opacity-60 transition-opacity' : ''}>
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          keyField="id"
          loading={!data}
          emptyMessage="No clients found"
          onRowClick={(item) => navigate(`/admin/users/${item.id}/`)}
        />
        {data && (
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} loading={loading} onPage={setPage} />
        )}
      </div>
    </div>
  )
}
