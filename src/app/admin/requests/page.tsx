'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import { useNavigation } from '@/hooks/useNavigation'
import type { AdminRequestList, AdminRequestRow, WaitingOn } from '@/types/adminRequests'
import { getCategoryText } from '@/utils/categoryLabels'
import StatCard from '../components/StatCard'
import DataTable, { type Column } from '../components/DataTable'
import DateRangePicker from '../components/DateRangePicker'
import Pager from '../components/Pager'
import { WaitingList, WaitingOnChip } from '../components/WaitingOnBadge'

const athensDateTime = new Intl.DateTimeFormat('el-GR', {
  timeZone: 'Europe/Athens',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const selectClass = 'px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest text-sm text-on-surface'

function statusClass(status: string): string {
  if (status === 'completed') return 'bg-green-100 text-green-700'
  if (status === 'cancelled') return 'bg-red-100 text-red-700'
  if (status === 'pending') return 'bg-yellow-100 text-yellow-700'
  return 'bg-blue-100 text-blue-700'
}

function RequestsPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { navigate, isNavigating } = useNavigation()

  // The filters live in the URL: the dashboard can link straight to a view, and
  // Back from a request returns to the same one.
  const query = searchParams?.toString() ?? ''
  const param = (name: string) => searchParams?.get(name) ?? ''
  const status = param('status')
  const category = param('category')
  const offers = param('offers')
  const waiting = param('waiting')
  const sort = param('sort')
  const from = param('from')
  const to = param('to')
  const clientId = param('clientId')
  const q = param('q')

  const [data, setData] = useState<AdminRequestList | null>(null)
  const [fetching, setFetching] = useState(true)
  const [failed, setFailed] = useState(false)
  const [search, setSearch] = useState(q)

  const setFilters = useCallback((patch: Record<string, string>) => {
    const next = new URLSearchParams(query)
    // Any new filter starts over at the first page.
    next.delete('page')
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    const qs = next.toString()
    router.replace(`/admin/requests/${qs ? `?${qs}` : ''}`, { scroll: false })
  }, [query, router])

  useEffect(() => {
    let current = true
    setFetching(true)
    setFailed(false)
    fetch(`/api/admin/requests/list/${query ? `?${query}` : ''}`)
      .then((res) => {
        if (!res.ok) throw new Error('list failed')
        return res.json()
      })
      .then((body: AdminRequestList) => { if (current) setData(body) })
      .catch(() => { if (current) setFailed(true) })
      .finally(() => { if (current) setFetching(false) })
    return () => { current = false }
  }, [query])

  // Typing waits for a pause before it touches the URL. The URL can also clear
  // the box (Clear filters), which must not count as typing.
  const typed = useRef(false)
  useEffect(() => { typed.current = false; setSearch(q) }, [q])
  useEffect(() => {
    if (!typed.current) return
    const timer = setTimeout(() => {
      typed.current = false
      setFilters({ q: search.trim() })
    }, 300)
    return () => clearTimeout(timer)
  }, [search, setFilters])

  const toggleStatus = (value: string) => setFilters({ status: status === value ? '' : value })

  const columns: Column<AdminRequestRow>[] = [
    {
      key: 'createdAt',
      header: 'Date',
      render: (item) => (
        <div className="whitespace-nowrap">
          <p>{item.createdAt ? athensDateTime.format(new Date(item.createdAt)) : '-'}</p>
          {item.createdAt && <p className="text-xs text-on-surface/50">{timeAgo(item.createdAt)}</p>}
        </div>
      ),
    },
    {
      key: 'client',
      header: 'Client',
      render: (item) => item.client ? (
        <div className="min-w-[10rem]">
          <button
            type="button"
            className="font-medium text-primary hover:underline text-left"
            title="Show this client's requests"
            onClick={(e) => { e.stopPropagation(); setFilters({ clientId: item.client!.id }) }}
          >
            {item.client.name}
          </button>
          {item.client.phone && (
            <a
              href={`tel:${item.client.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="block text-xs text-on-surface/70 hover:underline"
            >
              {item.client.phone}
            </a>
          )}
          {item.client.email && <p className="text-xs text-on-surface/50 break-all">{item.client.email}</p>}
        </div>
      ) : '-',
    },
    {
      key: 'vehicle',
      header: 'Vehicle',
      render: (item) => item.vehicle ? (
        <div className="min-w-[8rem]">
          <p>{item.vehicle.label || '-'}</p>
          {item.vehicle.plate && <p className="text-xs text-on-surface/50 font-mono">{item.vehicle.plate}</p>}
        </div>
      ) : '-',
    },
    { key: 'waiting', header: 'Waiting on', render: (item) => <WaitingList waiting={item.waiting} /> },
    { key: 'category', header: 'Category', render: (item) => <span className="whitespace-nowrap">{getCategoryText(item.category)}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (item) => (
        <div>
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusClass(item.status)}`}>
            {item.status}
          </span>
          {item.garageName && (
            <p className="text-xs text-on-surface/70 mt-1 whitespace-nowrap">
              {item.garageName}{item.appointmentDate ? ` · ${item.appointmentDate}` : ''}{item.appointmentTime ? ` ${item.appointmentTime}` : ''}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'offerCount',
      header: 'Offers',
      render: (item) => (
        <span className={item.offerCount === 0 && item.status === 'pending' ? 'font-bold text-error' : ''}>
          {item.offerCount}
        </span>
      ),
    },
    { key: 'messageCount', header: 'Messages' },
    { key: 'declineCount', header: 'Declined' },
  ]

  const funnel = data?.funnel
  const statusTiles = Object.entries(data?.byStatus ?? {})
    // Nothing ever writes in-progress; an empty tile would only be noise.
    .filter(([value, count]) => count > 0 || value !== 'in-progress')
  const hasFilters = Boolean(status || category || offers || waiting || q || clientId)
  const categoryOptions = [...(data?.categories ?? [])]
    .sort((a, b) => getCategoryText(a.value).localeCompare(getCategoryText(b.value), 'el'))

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
        <h1 className="text-2xl font-bold font-headline text-on-surface flex items-center gap-3">
          Request Analytics
          {/* Row clicks navigate; the table has no per-row control to spin. */}
          {isNavigating() && <Spinner size="sm" className="text-primary" />}
        </h1>
        <DateRangePicker from={from} to={to} allTime onChange={(f, t) => setFilters({ from: f, to: t })} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
        <StatCard
          icon="build"
          label="Total Requests"
          value={data ? (funnel?.created ?? 0) : '...'}
          color="primary"
          active={!status && !offers}
          onClick={() => setFilters({ status: '', offers: '' })}
        />
        <StatCard
          icon="hourglass_top"
          label="Pending, No Offers"
          value={data ? data.pendingNoOffers : '...'}
          color="error"
          active={status === 'pending' && offers === 'none'}
          onClick={() => setFilters({ status: 'pending', offers: 'none' })}
        />
        <StatCard
          icon="local_offer"
          label="With Offers"
          value={data ? (funnel?.offered ?? 0) : '...'}
          color="secondary"
          active={!status && offers === 'some'}
          onClick={() => setFilters({ status: '', offers: 'some' })}
        />
        <StatCard icon="handshake" label="Accepted" value={data ? (funnel?.accepted ?? 0) : '...'} color="primary" />
        <StatCard
          icon="check_circle"
          label="Completed"
          value={data ? (funnel?.completed ?? 0) : '...'}
          color="primary"
          active={status === 'completed' && !offers}
          onClick={() => setFilters({ status: 'completed', offers: '' })}
        />
      </div>

      {/* Conversion Funnel */}
      {funnel && funnel.created > 0 && (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-5 mb-6">
          <h2 className="text-lg font-semibold text-on-surface mb-4">Conversion Funnel</h2>
          <div className="space-y-3">
            {[
              { label: 'Created', value: funnel.created, color: 'bg-primary/20' },
              { label: 'Received Offers', value: funnel.offered, color: 'bg-primary/40' },
              { label: 'Accepted', value: funnel.accepted, color: 'bg-primary/60' },
              { label: 'Completed', value: funnel.completed, color: 'bg-primary/80' },
            ].map((step) => (
              <div key={step.label} className="flex items-center gap-4">
                <span className="text-sm text-on-surface/70 w-28 sm:w-36 shrink-0">{step.label}</span>
                <div className="flex-1 bg-surface-container rounded-full h-6 overflow-hidden">
                  <div
                    className={`h-full ${step.color} rounded-full flex items-center justify-end pr-2`}
                    style={{ width: `${Math.max(5, (step.value / funnel.created) * 100)}%` }}
                  >
                    <span className="text-xs font-medium text-on-surface">{step.value}</span>
                  </div>
                </div>
                <span className="text-xs text-on-surface/50 w-12 text-right">
                  {Math.round((step.value / funnel.created) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status Breakdown */}
      {statusTiles.length > 0 && (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-5 mb-6">
          <h2 className="text-lg font-semibold text-on-surface mb-3">By Status</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {statusTiles.map(([value, count]) => (
              <button
                key={value}
                type="button"
                aria-pressed={status === value}
                data-testid={`status-${value}`}
                onClick={() => toggleStatus(value)}
                className={`rounded-lg p-3 text-center transition-colors ${
                  status === value
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                }`}
              >
                <p className="text-xl font-bold">{count}</p>
                <p className={`text-xs capitalize mt-1 ${status === value ? '' : 'text-on-surface/60'}`}>
                  {value.replace(/-/g, ' ')}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Whom to call */}
      {data && (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-5 mb-6">
          <h2 className="text-lg font-semibold text-on-surface mb-3">Waiting On</h2>
          <div className="grid grid-cols-3 gap-3">
            {(['client', 'garage', 'admin'] as WaitingOn[]).map((on) => (
              <button
                key={on}
                type="button"
                aria-pressed={waiting === on}
                data-testid={`waiting-${on}`}
                onClick={() => setFilters({ waiting: waiting === on ? '' : on })}
                className={`rounded-lg p-3 flex flex-col items-center gap-1.5 transition-colors ${
                  waiting === on ? 'bg-primary-fixed ring-1 ring-primary' : 'bg-surface-container hover:bg-surface-container-high'
                }`}
              >
                <span className="text-xl font-bold text-on-surface">{data.byWaiting[on]}</span>
                <WaitingOnChip on={on} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Request List */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-4 mb-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[14rem]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/40 flex">
              <Icon name="search" size="sm" />
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => { typed.current = true; setSearch(e.target.value) }}
              placeholder="Client, phone, email, car, plate..."
              aria-label="Search requests"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest text-sm text-on-surface"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setFilters({ status: e.target.value })}
            aria-label="Status"
            className={selectClass}
          >
            <option value="">All statuses</option>
            {statusTiles.map(([value]) => (
              <option key={value} value={value}>{value.replace(/-/g, ' ')}</option>
            ))}
          </select>
          <select
            value={category}
            onChange={(e) => setFilters({ category: e.target.value })}
            aria-label="Category"
            className={selectClass}
          >
            <option value="">All categories</option>
            {categoryOptions.map((c) => (
              <option key={c.value} value={c.value}>{getCategoryText(c.value)} ({c.count})</option>
            ))}
          </select>
          <select
            value={offers}
            onChange={(e) => setFilters({ offers: e.target.value })}
            aria-label="Offers"
            className={selectClass}
          >
            <option value="">Any offers</option>
            <option value="none">No offers</option>
            <option value="some">Has offers</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setFilters({ sort: e.target.value })}
            aria-label="Sort"
            className={selectClass}
          >
            <option value="">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          {hasFilters && (
            <button
              type="button"
              onClick={() => setFilters({ status: '', category: '', offers: '', waiting: '', q: '', clientId: '' })}
              className="text-sm font-medium text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
        {clientId && (
          <div className="flex items-center gap-2 flex-wrap mt-3" data-testid="client-filter">
            <span className="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full bg-primary-fixed text-sm text-on-surface">
              Client: {data?.client?.name ?? clientId}
              <button
                type="button"
                aria-label="Remove client filter"
                onClick={() => setFilters({ clientId: '' })}
                className="flex p-0.5 rounded-full hover:bg-primary/10"
              >
                <Icon name="close" size="sm" />
              </button>
            </span>
            <Link href={`/admin/users/${clientId}/`} className="text-sm font-medium text-primary hover:underline">
              Open profile
            </Link>
          </div>
        )}
      </div>

      <h2 className="text-lg font-semibold text-on-surface mb-3 flex items-center gap-2">
        Requests
        {data && <span className="text-sm font-normal text-on-surface/50">{data.total}</span>}
        {fetching && data && <Spinner size="sm" className="text-primary" />}
      </h2>
      {failed ? (
        <div className="bg-error-container/30 rounded-xl p-5 text-sm text-on-surface">
          The requests could not be loaded. Reload the page to try again.
        </div>
      ) : (
        <div className={fetching && data ? 'opacity-60 transition-opacity' : ''}>
          <DataTable
            columns={columns}
            data={data?.items ?? []}
            keyField="id"
            loading={!data}
            emptyMessage={hasFilters ? 'No requests match these filters' : 'No requests found for this period'}
            onRowClick={(item) => navigate(`/admin/requests/${item.id}/`)}
          />
          {data && (
            <Pager
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              loading={fetching}
              onPage={(page) => {
                const next = new URLSearchParams(query)
                if (page > 1) next.set('page', String(page))
                else next.delete('page')
                const qs = next.toString()
                router.replace(`/admin/requests/${qs ? `?${qs}` : ''}`, { scroll: false })
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

export default function RequestsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" className="text-primary" />
        </div>
      }
    >
      <RequestsPageContent />
    </Suspense>
  )
}
