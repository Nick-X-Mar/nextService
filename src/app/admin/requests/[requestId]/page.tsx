'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DayPicker } from 'react-day-picker'
import { addDays, addMonths, isWeekend, format } from 'date-fns'
import { el } from 'date-fns/locale'
import 'react-day-picker/dist/style.css'

interface RequestDetail {
  id: string
  description: string
  category: string
  status: string
  createdAt: string
  updatedAt?: string
  estimatedCost?: number
  clientAvailabilityDates: string[]
  acceptedOfferId?: string
  appointmentDate?: string
  appointmentPrice?: number
  cancelledAt?: string
  photoUrls: string[]
  client: {
    id: string
    firstName: string
    lastName: string
    email: string
    phoneNumber: string
  } | null
  vehicle: {
    brand: string
    model: string
    year: string
    licensePlate: string
    engineCC?: string
    fuelType?: string
    is4x4?: boolean
    isAutomatic?: boolean
    isTurbo?: boolean
  } | null
  offers: Array<{
    id: string
    garageId: string
    garageName: string
    price: number
    message: string
    status: string
    createdAt: string
  }>
}

interface GarageOption {
  id: string
  name: string
}

const statusStyles: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  appointment: 'bg-blue-100 text-blue-700',
  'in-progress': 'bg-indigo-100 text-indigo-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

const offerStatusStyles: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

export default function RequestDetailPage() {
  const { requestId } = useParams<{ requestId: string }>()
  const router = useRouter()
  const [data, setData] = useState<RequestDetail | null>(null)
  const [loading, setLoading] = useState(true)

  // Assign modal state
  const [showAssign, setShowAssign] = useState(false)
  const [garages, setGarages] = useState<GarageOption[]>([])
  const [garagesLoading, setGaragesLoading] = useState(false)
  const [assignForm, setAssignForm] = useState({ garageId: '', price: '' })
  const [selectedDates, setSelectedDates] = useState<Date[]>([])
  const [assigning, setAssigning] = useState(false)

  // Cancel state
  const [cancelling, setCancelling] = useState(false)

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/requests/${requestId}`)
      if (res.ok) {
        setData(await res.json())
      }
    } catch { /* empty */ }
    setLoading(false)
  }, [requestId])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  async function handleCancel() {
    if (!confirm('Σίγουρα θέλετε να ακυρώσετε αυτό το request;')) return
    setCancelling(true)
    try {
      const res = await fetch(`/api/admin/requests/${requestId}/cancel`, { method: 'PATCH' })
      if (res.ok) {
        await fetchDetail()
      } else {
        const err = await res.json()
        alert(err.error || 'Αποτυχία ακύρωσης')
      }
    } catch { alert('Αποτυχία ακύρωσης') }
    setCancelling(false)
  }

  async function openAssignModal() {
    setShowAssign(true)
    if (garages.length === 0) {
      setGaragesLoading(true)
      try {
        const res = await fetch('/api/admin/users/garages?limit=100&status=active')
        if (res.ok) {
          const data = await res.json()
          setGarages((data.items || []).map((g: { id: string; name: string }) => ({ id: g.id, name: g.name })))
        }
      } catch { /* empty */ }
      setGaragesLoading(false)
    }
  }

  async function handleAssign() {
    if (!assignForm.garageId || !assignForm.price) {
      alert('Επιλέξτε συνεργείο και τιμή')
      return
    }
    setAssigning(true)
    try {
      const dates = selectedDates
        .sort((a, b) => a.getTime() - b.getTime())
        .map((d) => format(d, 'yyyy-MM-dd'))

      const res = await fetch(`/api/admin/requests/${requestId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          garageId: assignForm.garageId,
          price: parseFloat(assignForm.price),
          availabilityDates: dates
        })
      })
      if (res.ok) {
        setShowAssign(false)
        setAssignForm({ garageId: '', price: '' })
        setSelectedDates([])
        await fetchDetail()
      } else {
        const err = await res.json()
        alert(err.error || 'Αποτυχία ανάθεσης')
      }
    } catch { alert('Αποτυχία ανάθεσης') }
    setAssigning(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-20">
        <p className="text-on-surface/60">Request not found</p>
        <button onClick={() => router.back()} className="text-primary text-sm mt-2">Πίσω</button>
      </div>
    )
  }

  const canCancel = data.status !== 'cancelled' && data.status !== 'completed'
  const canAssign = data.status === 'pending'

  return (
    <div>
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-on-surface/60 hover:text-on-surface mb-4"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Πίσω στα requests
      </button>

      {/* Header */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold font-headline text-on-surface">
              {data.category}
            </h1>
            <p className="text-sm text-on-surface/60 mt-1">
              {new Date(data.createdAt).toLocaleString('el-GR')}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[data.status] || 'bg-surface-container text-on-surface/70'}`}>
                {data.status}
              </span>
              {data.cancelledAt && (
                <span className="text-xs text-on-surface/40">
                  Ακυρώθηκε: {new Date(data.cancelledAt).toLocaleDateString('el-GR')}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canAssign && (
              <button
                onClick={openAssignModal}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-on-primary rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">assignment_ind</span>
                Ανάθεση σε Συνεργείο
              </button>
            )}
            {canCancel && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-error-container text-on-error-container rounded-lg text-sm font-medium hover:bg-error-container/80 transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">cancel</span>
                {cancelling ? 'Ακύρωση...' : 'Ακύρωση'}
              </button>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="mt-5 p-4 bg-surface-container rounded-lg">
          <p className="text-xs text-on-surface/50 mb-1">Περιγραφή</p>
          <p className="text-sm text-on-surface whitespace-pre-wrap">{data.description || '-'}</p>
        </div>

        {/* Appointment info */}
        {data.appointmentDate && (
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-on-surface/50">Ημ/νία Ραντεβού</p>
              <p className="text-sm text-on-surface">{new Date(data.appointmentDate).toLocaleDateString('el-GR')}</p>
            </div>
            {data.appointmentPrice != null && (
              <div>
                <p className="text-xs text-on-surface/50">Τιμή</p>
                <p className="text-sm text-on-surface font-medium">{data.appointmentPrice}€</p>
              </div>
            )}
          </div>
        )}

        {/* Availability dates */}
        {data.clientAvailabilityDates.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-on-surface/50 mb-1">Διαθεσιμότητα Πελάτη</p>
            <div className="flex flex-wrap gap-2">
              {data.clientAvailabilityDates.map((d) => (
                <span key={d} className="text-xs bg-surface-container-high text-on-surface/70 px-2 py-1 rounded">
                  {new Date(d).toLocaleDateString('el-GR')}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Client & Vehicle */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Client */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-5">
          <h2 className="text-sm font-semibold text-on-surface mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary">person</span>
            Πελάτης
          </h2>
          {data.client ? (
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-on-surface/50">Ονοματεπώνυμο</span>
                <span className="text-sm text-on-surface">{data.client.firstName} {data.client.lastName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-on-surface/50">Email</span>
                <span className="text-sm text-on-surface">{data.client.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-on-surface/50">Τηλέφωνο</span>
                <span className="text-sm text-on-surface">{data.client.phoneNumber || '-'}</span>
              </div>
              <button
                onClick={() => router.push(`/admin/users/${data.client!.id}`)}
                className="text-xs text-primary hover:underline mt-1"
              >
                Προβολή προφίλ →
              </button>
            </div>
          ) : (
            <p className="text-sm text-on-surface/50">Μη διαθέσιμα στοιχεία</p>
          )}
        </div>

        {/* Vehicle */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-5">
          <h2 className="text-sm font-semibold text-on-surface mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary">directions_car</span>
            Όχημα
          </h2>
          {data.vehicle ? (
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-on-surface/50">Μάρκα / Μοντέλο</span>
                <span className="text-sm text-on-surface">{data.vehicle.brand} {data.vehicle.model}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-on-surface/50">Έτος</span>
                <span className="text-sm text-on-surface">{data.vehicle.year || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-on-surface/50">Πινακίδα</span>
                <span className="text-sm text-on-surface font-mono">{data.vehicle.licensePlate || '-'}</span>
              </div>
              {data.vehicle.engineCC && (
                <div className="flex justify-between">
                  <span className="text-xs text-on-surface/50">Κυβικά</span>
                  <span className="text-sm text-on-surface">{data.vehicle.engineCC}cc</span>
                </div>
              )}
              {data.vehicle.fuelType && (
                <div className="flex justify-between">
                  <span className="text-xs text-on-surface/50">Καύσιμο</span>
                  <span className="text-sm text-on-surface">{data.vehicle.fuelType}</span>
                </div>
              )}
              <div className="flex gap-2 mt-1">
                {data.vehicle.is4x4 && <span className="text-xs bg-surface-container-high text-on-surface/60 px-2 py-0.5 rounded">4x4</span>}
                {data.vehicle.isAutomatic && <span className="text-xs bg-surface-container-high text-on-surface/60 px-2 py-0.5 rounded">Αυτόματο</span>}
                {data.vehicle.isTurbo && <span className="text-xs bg-surface-container-high text-on-surface/60 px-2 py-0.5 rounded">Turbo</span>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-on-surface/50">Μη διαθέσιμα στοιχεία</p>
          )}
        </div>
      </div>

      {/* Photos */}
      {data.photoUrls.length > 0 && (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-5 mb-6">
          <h2 className="text-sm font-semibold text-on-surface mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary">photo_library</span>
            Φωτογραφίες ({data.photoUrls.length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {data.photoUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                <img
                  src={url}
                  alt={`Photo ${i + 1}`}
                  className="w-full h-32 object-cover rounded-lg border border-outline-variant/20 hover:opacity-80 transition-opacity"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Offers */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 overflow-hidden">
        <div className="px-5 py-3 border-b border-outline-variant/20 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary">local_offer</span>
            Προσφορές ({data.offers.length})
          </h2>
        </div>
        {data.offers.length === 0 ? (
          <div className="p-8 text-center text-sm text-on-surface/50">
            Δεν υπάρχουν προσφορές
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/10">
            {data.offers.map((offer) => (
              <div key={offer.id} className="px-5 py-4 hover:bg-surface-container-low transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-on-surface">{offer.garageName}</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${offerStatusStyles[offer.status] || 'bg-surface-container text-on-surface/70'}`}>
                      {offer.status}
                    </span>
                    {offer.id === data.acceptedOfferId && (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        Επιλεγμένη
                      </span>
                    )}
                  </div>
                  <span className="text-lg font-bold text-on-surface">{offer.price}€</span>
                </div>
                {offer.message && (
                  <p className="text-sm text-on-surface/70 whitespace-pre-wrap">{offer.message}</p>
                )}
                <p className="text-xs text-on-surface/40 mt-1">
                  {new Date(offer.createdAt).toLocaleString('el-GR')}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assign Modal */}
      {showAssign && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAssign(false)}>
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold font-headline text-on-surface mb-4">Ανάθεση σε Συνεργείο</h2>

            <div className="space-y-4">
              {/* Garage select */}
              <div>
                <label className="text-xs text-on-surface/60 block mb-1">Συνεργείο</label>
                {garagesLoading ? (
                  <div className="h-10 bg-surface-container rounded-lg animate-pulse" />
                ) : (
                  <select
                    value={assignForm.garageId}
                    onChange={(e) => setAssignForm((f) => ({ ...f, garageId: e.target.value }))}
                    className="w-full h-10 px-3 bg-surface-container rounded-lg border border-outline-variant/30 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <option value="">Επιλέξτε συνεργείο...</option>
                    {garages.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Price */}
              <div>
                <label className="text-xs text-on-surface/60 block mb-1">Τιμή (€)</label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={assignForm.price}
                  onChange={(e) => setAssignForm((f) => ({ ...f, price: e.target.value }))}
                  placeholder="π.χ. 150"
                  className="w-full h-10 px-3 bg-surface-container rounded-lg border border-outline-variant/30 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {/* Availability dates */}
              <div>
                <label className="text-xs text-on-surface/60 block mb-1">Διαθέσιμες ημ/νίες (Δευτ - Παρ, έως 2 μήνες)</label>
                <div className="flex justify-center mt-2">
                  <DayPicker
                    mode="multiple"
                    selected={selectedDates}
                    onSelect={(dates) => setSelectedDates(dates || [])}
                    locale={el}
                    disabled={[
                      { before: addDays(new Date(), 1) },
                      (date) => isWeekend(date),
                      { after: addMonths(new Date(), 2) }
                    ]}
                    fromDate={addDays(new Date(), 1)}
                    toDate={addMonths(new Date(), 2)}
                    className="border border-outline-variant/20 rounded-xl p-3 bg-surface-container-lowest"
                    modifiersClassNames={{
                      selected: '!bg-primary !text-on-primary hover:!bg-primary/90 !rounded-lg',
                      today: '!font-bold !text-primary'
                    }}
                    styles={{
                      root: { color: '#1b1c1c' },
                      caption_label: { color: '#1b1c1c', fontWeight: 700 },
                      nav_button: { color: '#8a5100' },
                      head_cell: { color: '#554434', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' as const },
                      day: { color: '#1b1c1c', borderRadius: '8px' },
                      day_disabled: { color: '#e4e2e1' },
                      day_outside: { color: '#e4e2e1' }
                    }}
                  />
                </div>
                {selectedDates.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {selectedDates
                      .sort((a, b) => a.getTime() - b.getTime())
                      .map((date, i) => (
                        <span key={i} className="px-2.5 py-1 bg-primary text-on-primary rounded-full text-xs font-medium">
                          {format(date, 'dd/MM/yyyy (EEEE)', { locale: el })}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAssign(false)}
                className="px-4 py-2 text-sm text-on-surface/70 hover:text-on-surface transition-colors"
              >
                Ακύρωση
              </button>
              <button
                onClick={handleAssign}
                disabled={assigning || !assignForm.garageId || !assignForm.price}
                className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {assigning ? 'Ανάθεση...' : 'Ανάθεση & Ειδοποίηση'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
