'use client'

import { useEffect, useState } from 'react'

interface CustomVehicle {
  id: string
  clientId: string
  brand: string
  model: string
  isBrandOther: boolean
  isModelOther: boolean
  modelYear?: string
  engineCC?: string
  fuelType?: string
  createdAt: string
}

interface CustomVehiclesData {
  vehicles: CustomVehicle[]
  total: number
  uniqueCustomBrands: string[]
  uniqueCustomModels: string[]
}

export default function CustomVehiclesPage() {
  const [data, setData] = useState<CustomVehiclesData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch_data() {
      try {
        const res = await fetch('/api/admin/custom-vehicles/')
        if (res.ok) {
          setData(await res.json())
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false)
      }
    }
    fetch_data()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!data || data.total === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-on-surface">Custom Vehicles</h1>
        <div className="bg-surface-container-lowest rounded-2xl p-8 text-center">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-3 block">check_circle</span>
          <p className="text-on-surface-variant">No custom brands or models to review</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Custom Vehicles</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Vehicles with custom brands or models that need review
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-container-lowest rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-1">
            <span className="material-symbols-outlined text-tertiary">pending</span>
            <span className="text-sm font-medium text-on-surface-variant">Pending Review</span>
          </div>
          <p className="text-3xl font-bold text-on-surface">{data.total}</p>
        </div>
        <div className="bg-surface-container-lowest rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-1">
            <span className="material-symbols-outlined text-primary">directions_car</span>
            <span className="text-sm font-medium text-on-surface-variant">Custom Brands</span>
          </div>
          <p className="text-3xl font-bold text-on-surface">{data.uniqueCustomBrands.length}</p>
          {data.uniqueCustomBrands.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {data.uniqueCustomBrands.map(b => (
                <span key={b} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="bg-surface-container-lowest rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-1">
            <span className="material-symbols-outlined text-secondary">category</span>
            <span className="text-sm font-medium text-on-surface-variant">Custom Models</span>
          </div>
          <p className="text-3xl font-bold text-on-surface">{data.uniqueCustomModels.length}</p>
          {data.uniqueCustomModels.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {data.uniqueCustomModels.map(m => (
                <span key={m} className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full font-medium">
                  {m}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Vehicle list */}
      <div className="bg-surface-container-lowest rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-outline-variant/20">
              <th className="text-left text-xs font-bold uppercase tracking-wider text-on-surface-variant px-5 py-3">Type</th>
              <th className="text-left text-xs font-bold uppercase tracking-wider text-on-surface-variant px-5 py-3">Brand</th>
              <th className="text-left text-xs font-bold uppercase tracking-wider text-on-surface-variant px-5 py-3">Model</th>
              <th className="text-left text-xs font-bold uppercase tracking-wider text-on-surface-variant px-5 py-3">Year</th>
              <th className="text-left text-xs font-bold uppercase tracking-wider text-on-surface-variant px-5 py-3">Engine</th>
              <th className="text-left text-xs font-bold uppercase tracking-wider text-on-surface-variant px-5 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {data.vehicles.map((v) => (
              <tr key={v.id} className="border-b border-outline-variant/10 hover:bg-surface-container transition-colors">
                <td className="px-5 py-3">
                  <div className="flex gap-1.5">
                    {v.isBrandOther && (
                      <span className="text-[10px] font-bold uppercase bg-error/10 text-error px-2 py-0.5 rounded-full">
                        Brand
                      </span>
                    )}
                    {v.isModelOther && (
                      <span className="text-[10px] font-bold uppercase bg-tertiary/10 text-tertiary px-2 py-0.5 rounded-full">
                        Model
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <span className={`text-sm font-bold ${v.isBrandOther ? 'text-error' : 'text-on-surface'}`}>
                    {v.brand}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <span className={`text-sm font-bold ${v.isModelOther ? 'text-tertiary' : 'text-on-surface'}`}>
                    {v.model}
                  </span>
                </td>
                <td className="px-5 py-3 text-sm text-on-surface-variant">{v.modelYear || '-'}</td>
                <td className="px-5 py-3 text-sm text-on-surface-variant">{v.engineCC ? `${v.engineCC}cc` : '-'}</td>
                <td className="px-5 py-3 text-sm text-on-surface-variant">
                  {new Date(v.createdAt).toLocaleDateString('el-GR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
