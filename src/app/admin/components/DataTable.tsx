'use client'

import { useState } from 'react'

export interface Column<T> {
  key: string
  header: string
  render?: (item: T) => React.ReactNode
  sortable?: boolean
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyField: keyof T
  loading?: boolean
  emptyMessage?: string
  onRowClick?: (item: T) => void
  pagination?: {
    hasMore: boolean
    onLoadMore: () => void
    loadingMore: boolean
  }
}

export default function DataTable<T>({
  columns,
  data,
  keyField,
  loading,
  emptyMessage = 'No data found',
  onRowClick,
  pagination
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedData = sortKey
    ? [...data].sort((a, b) => {
        const av = (a as Record<string, unknown>)[sortKey]
        const bv = (b as Record<string, unknown>)[sortKey]
        const cmp = String(av ?? '').localeCompare(String(bv ?? ''))
        return sortDir === 'asc' ? cmp : -cmp
      })
    : data

  if (loading) {
    return (
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-outline-variant/20">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`text-left text-xs font-medium text-on-surface/60 uppercase tracking-wider px-5 py-3 ${
                    col.sortable ? 'cursor-pointer hover:text-on-surface select-none' : ''
                  }`}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <span className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && sortKey === col.key && (
                      <span className="material-symbols-outlined text-[14px]">
                        {sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-8 text-center text-sm text-on-surface/50">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedData.map((item) => (
                <tr
                  key={String(item[keyField])}
                  className={`border-b border-outline-variant/10 last:border-0 ${
                    onRowClick ? 'cursor-pointer hover:bg-surface-container-low transition-colors' : ''
                  }`}
                  onClick={onRowClick ? () => onRowClick(item) : undefined}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-5 py-3 text-sm text-on-surface">
                      {col.render ? col.render(item) : String((item as Record<string, unknown>)[col.key] ?? '-')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pagination?.hasMore && (
        <div className="border-t border-outline-variant/20 px-5 py-3 flex justify-center">
          <button
            onClick={pagination.onLoadMore}
            disabled={pagination.loadingMore}
            className="text-sm text-primary hover:text-primary/80 font-medium disabled:opacity-50"
          >
            {pagination.loadingMore ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
