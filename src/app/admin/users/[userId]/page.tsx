'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import StatCard from '../../components/StatCard'

interface UserDetail {
  id: string
  type: 'client' | 'garage'
  email: string
  name: string
  phone: string
  createdAt: string
  isActive?: boolean
  // Client fields
  firstName?: string
  lastName?: string
  vehicles?: Array<{ id: string; make: string; model: string; year: string }>
  requestCount?: number
  // Garage fields
  companyName?: string
  tin?: string
  address?: string
  offerCount?: number
}

export default function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const router = useRouter()
  const [user, setUser] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchUser() {
      try {
        // Try client first, then garage
        let res = await fetch(`/api/admin/users/clients/${userId}`)
        if (!res.ok) {
          res = await fetch(`/api/admin/users/garages/${userId}`)
        }
        if (res.ok) {
          setUser(await res.json())
        }
      } catch { /* empty */ }
      setLoading(false)
    }
    fetchUser()
  }, [userId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="text-center py-20">
        <p className="text-on-surface/60">User not found</p>
        <button onClick={() => router.back()} className="text-primary text-sm mt-2">Go back</button>
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-on-surface/60 hover:text-on-surface mb-4"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Back to users
      </button>

      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold font-headline text-on-surface">{user.name}</h1>
            <p className="text-sm text-on-surface/60 mt-1">{user.email}</p>
            <div className="flex items-center gap-3 mt-2">
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                user.type === 'client' ? 'bg-primary-container/30 text-on-primary-container' : 'bg-secondary-container text-on-secondary-container'
              }`}>
                {user.type}
              </span>
              {user.isActive !== undefined && (
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                  user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {user.isActive ? 'Active' : 'Inactive'}
                </span>
              )}
            </div>
          </div>
          <p className="text-xs text-on-surface/40">ID: {user.id}</p>
        </div>

        {/* Details */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          <div>
            <p className="text-xs text-on-surface/50">Phone</p>
            <p className="text-sm text-on-surface">{user.phone || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-on-surface/50">Registered</p>
            <p className="text-sm text-on-surface">{new Date(user.createdAt).toLocaleDateString()}</p>
          </div>
          {user.tin && (
            <div>
              <p className="text-xs text-on-surface/50">TIN</p>
              <p className="text-sm text-on-surface">{user.tin}</p>
            </div>
          )}
          {user.address && (
            <div>
              <p className="text-xs text-on-surface/50">Address</p>
              <p className="text-sm text-on-surface">{user.address}</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {user.type === 'client' && (
          <>
            <StatCard icon="directions_car" label="Vehicles" value={user.vehicles?.length ?? 0} color="primary" />
            <StatCard icon="build" label="Requests" value={user.requestCount ?? 0} color="secondary" />
          </>
        )}
        {user.type === 'garage' && (
          <StatCard icon="local_offer" label="Total Offers" value={user.offerCount ?? 0} color="primary" />
        )}
      </div>

      {/* Vehicles List (for clients) */}
      {user.vehicles && user.vehicles.length > 0 && (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-5">
          <h2 className="text-lg font-semibold text-on-surface mb-3">Vehicles</h2>
          <div className="space-y-2">
            {user.vehicles.map((v) => (
              <div key={v.id} className="bg-surface-container rounded-lg p-3 flex items-center justify-between">
                <span className="text-sm text-on-surface">{v.make} {v.model} ({v.year})</span>
                <span className="text-xs text-on-surface/40">{v.id}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
