'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Spinner from '@/components/Spinner'
import { useNavigation } from '@/hooks/useNavigation'
import StatCard from '../../components/StatCard'

interface UserDetail {
  id: string
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
  address?: string
}

export default function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const router = useRouter()
  const { back, isNavigating } = useNavigation()
  const [user, setUser] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchUser() {
      try {
        // Garages have their own page; an old link to one lands there.
        if (userId.startsWith('garage-')) {
          router.replace(`/admin/garages/${userId}/`)
          return
        }
        const res = await fetch(`/api/admin/users/clients/${userId}/`)
        if (res.ok) {
          setUser(await res.json())
        }
      } catch { /* empty */ }
      setLoading(false)
    }
    fetchUser()
  }, [userId, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-primary">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="text-center py-20">
        <p className="text-on-surface/60">User not found</p>
        <button
          onClick={back}
          disabled={isNavigating()}
          className="text-primary text-sm mt-2 inline-flex items-center gap-1.5"
        >
          {isNavigating() && <Spinner size="sm" />}
          Go back
        </button>
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={back}
        disabled={isNavigating()}
        className="flex items-center gap-1 text-sm text-on-surface/60 hover:text-on-surface mb-4"
      >
        {isNavigating()
          ? <Spinner size="sm" />
          : <span className="material-symbols-outlined text-[18px]">arrow_back</span>}
        Back to clients
      </button>

      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold font-headline text-on-surface">{user.name}</h1>
            <p className="text-sm text-on-surface/60 mt-1">{user.email}</p>
            <div className="flex items-center gap-3 mt-2">
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
        <StatCard icon="directions_car" label="Vehicles" value={user.vehicles?.length ?? 0} color="primary" />
        <StatCard
          icon="build"
          label="Requests"
          value={user.requestCount ?? 0}
          color="secondary"
          href={`/admin/requests/?clientId=${user.id}`}
        />
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
