'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Image from 'next/image'
import Spinner from '@/components/Spinner'
import { useAsyncTask } from '@/hooks/useAsyncTask'
import type { HotDeal } from '@/types/hotDeals'

const emptyDeal: Partial<HotDeal> = {
  title: '', subtitle: '', description: '', price: '', priceNum: 0,
  image: '', icon: 'build', details: [], duration: '', category: 'service',
  workType: '', popular: true, isActive: true
}

export default function HotDealsAdminPage() {
  const [deals, setDeals] = useState<HotDeal[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<HotDeal> | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [detailInput, setDetailInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const { run, isPending } = useAsyncTask()
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchDeals = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/hot-deals/')
      if (res.ok) {
        const data = await res.json()
        setDeals(data.items || [])
      }
    } catch { /* empty */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchDeals() }, [fetchDeals])

  async function handleSave() {
    if (!editing) return
    setSaving(true)

    try {
      if (isNew) {
        const res = await fetch('/api/admin/hot-deals/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...editing, sortOrder: deals.length })
        })
        if (res.ok) {
          setEditing(null)
          fetchDeals()
        }
      } else {
        const res = await fetch(`/api/admin/hot-deals/${editing.dealId}/`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editing)
        })
        if (res.ok) {
          setEditing(null)
          fetchDeals()
        }
      }
    } catch { /* empty */ }
    setSaving(false)
  }

  async function handleDelete(dealId: string) {
    if (!confirm('Delete this deal?')) return
    try {
      await fetch(`/api/admin/hot-deals/${dealId}/`, { method: 'DELETE' })
      fetchDeals()
    } catch { /* empty */ }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !editing) return
    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/admin/hot-deals/upload/', {
        method: 'POST',
        body: formData
      })
      if (res.ok) {
        const data = await res.json()
        setEditing({ ...editing, image: data.url })
      }
    } catch { /* empty */ }
    setUploading(false)
  }

  function addDetail() {
    if (!detailInput.trim() || !editing) return
    setEditing({ ...editing, details: [...(editing.details || []), detailInput.trim()] })
    setDetailInput('')
  }

  function removeDetail(index: number) {
    if (!editing) return
    setEditing({ ...editing, details: (editing.details || []).filter((_, i) => i !== index) })
  }

  async function moveCard(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= deals.length) return
    const newOrder = [...deals]
    const [moved] = newOrder.splice(index, 1)
    newOrder.splice(target, 0, moved)
    setDeals(newOrder)

    try {
      await fetch('/api/admin/hot-deals/reorder/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newOrder.map((d) => d.dealId) })
      })
    } catch { /* empty */ }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  // Editor form
  if (editing) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold font-headline text-on-surface">
            {isNew ? 'New Deal' : 'Edit Deal'}
          </h1>
          <button
            onClick={() => setEditing(null)}
            className="text-sm text-on-surface/60 hover:text-on-surface"
          >
            Cancel
          </button>
        </div>

        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 space-y-5 max-w-2xl">
          {/* Image */}
          <div>
            <label className="block text-sm font-medium text-on-surface/70 mb-2">Image</label>
            {editing.image && (
              <div className="relative w-full h-48 rounded-lg overflow-hidden mb-2">
                <Image src={editing.image} alt="" fill sizes="(max-width: 768px) 100vw, 600px" className="object-cover" />
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface hover:bg-surface-container-highest transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">upload</span>
              {uploading ? 'Uploading...' : editing.image ? 'Change Image' : 'Upload Image'}
            </button>
            <p className="text-xs text-on-surface/40 mt-1">Or paste a URL:</p>
            <input
              type="text"
              value={editing.image || ''}
              onChange={(e) => setEditing({ ...editing, image: e.target.value })}
              placeholder="/images/offers/photo.jpeg or https://..."
              className="w-full mt-1 px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface text-sm text-on-surface"
            />
          </div>

          {/* Title & Subtitle */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-on-surface/70 mb-1">Title</label>
              <input
                type="text"
                value={editing.title || ''}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface text-sm text-on-surface"
                placeholder="e.g. Συμπλέκτης"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface/70 mb-1">Subtitle</label>
              <input
                type="text"
                value={editing.subtitle || ''}
                onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface text-sm text-on-surface"
                placeholder="e.g. Daewoo Matiz 1000cc"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-on-surface/70 mb-1">Description</label>
            <textarea
              value={editing.description || ''}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface text-sm text-on-surface resize-none"
            />
          </div>

          {/* Price & Duration */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-on-surface/70 mb-1">Price (display)</label>
              <input
                type="text"
                value={editing.price || ''}
                onChange={(e) => setEditing({ ...editing, price: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface text-sm text-on-surface"
                placeholder="200€"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface/70 mb-1">Price (numeric)</label>
              <input
                type="number"
                value={editing.priceNum || ''}
                onChange={(e) => setEditing({ ...editing, priceNum: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface text-sm text-on-surface"
                placeholder="200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface/70 mb-1">Duration</label>
              <input
                type="text"
                value={editing.duration || ''}
                onChange={(e) => setEditing({ ...editing, duration: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface text-sm text-on-surface"
                placeholder="4-6 ώρες"
              />
            </div>
          </div>

          {/* Category, Icon, WorkType */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-on-surface/70 mb-1">Category</label>
              <select
                value={editing.category || 'service'}
                onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface text-sm text-on-surface"
              >
                <option value="service">Service</option>
                <option value="fanopeia">Fanopeia</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface/70 mb-1">Icon</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editing.icon || ''}
                  onChange={(e) => setEditing({ ...editing, icon: e.target.value })}
                  className="flex-1 px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface text-sm text-on-surface"
                  placeholder="build"
                />
                <span className="material-symbols-outlined text-[24px] text-on-surface/60">
                  {editing.icon || 'build'}
                </span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface/70 mb-1">Work Type</label>
              <input
                type="text"
                value={editing.workType || ''}
                onChange={(e) => setEditing({ ...editing, workType: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface text-sm text-on-surface"
                placeholder="Αντικατάσταση"
              />
            </div>
          </div>

          {/* Details (tags) */}
          <div>
            <label className="block text-sm font-medium text-on-surface/70 mb-1">Details (what&apos;s included)</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {(editing.details || []).map((d, i) => (
                <span key={i} className="inline-flex items-center gap-1 bg-surface-container-high px-3 py-1 rounded-full text-sm text-on-surface">
                  {d}
                  <button onClick={() => removeDetail(i)} className="text-on-surface/40 hover:text-error">
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={detailInput}
                onChange={(e) => setDetailInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addDetail())}
                className="flex-1 px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface text-sm text-on-surface"
                placeholder="Add detail and press Enter"
              />
              <button onClick={addDetail} className="px-3 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium">
                Add
              </button>
            </div>
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editing.isActive ?? true}
                onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm text-on-surface">Active</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editing.popular ?? true}
                onChange={(e) => setEditing({ ...editing, popular: e.target.checked })}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm text-on-surface">Popular</span>
            </label>
          </div>

          {/* Save */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving || !editing.title}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {saving
                ? <Spinner size="sm" />
                : <span className="material-symbols-outlined text-[18px]">save</span>}
              {saving ? 'Saving...' : 'Save Deal'}
            </button>
            <button
              onClick={() => setEditing(null)}
              className="px-5 py-2.5 rounded-lg bg-surface-container-high text-sm text-on-surface hover:bg-surface-container-highest"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Deal list
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-headline text-on-surface">Hot Deals</h1>
        <button
          onClick={() => { setEditing({ ...emptyDeal }); setIsNew(true) }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium hover:bg-primary/90"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Deal
        </button>
      </div>

      {deals.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-12 text-center">
          <span className="material-symbols-outlined text-[48px] text-on-surface/30">local_offer</span>
          <p className="text-on-surface/50 mt-3">No deals yet. Create your first hot deal.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {deals.map((deal, index) => (
            <div
              key={deal.dealId}
              className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-4 flex items-center gap-4"
            >
              {/* Reorder arrows */}
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveCard(index, -1)}
                  disabled={index === 0}
                  className="text-on-surface/40 hover:text-on-surface disabled:opacity-20"
                >
                  <span className="material-symbols-outlined text-[18px]">keyboard_arrow_up</span>
                </button>
                <button
                  onClick={() => moveCard(index, 1)}
                  disabled={index === deals.length - 1}
                  className="text-on-surface/40 hover:text-on-surface disabled:opacity-20"
                >
                  <span className="material-symbols-outlined text-[18px]">keyboard_arrow_down</span>
                </button>
              </div>

              {/* Image thumbnail */}
              <div className="relative w-20 h-14 rounded-lg overflow-hidden bg-surface-container-high shrink-0">
                {deal.image ? (
                  <Image src={deal.image} alt={deal.title} fill sizes="80px" className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="material-symbols-outlined text-on-surface/30">{deal.icon}</span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-on-surface truncate">{deal.title}</h3>
                  {!deal.isActive && (
                    <span className="text-xs bg-surface-container-high text-on-surface/50 px-2 py-0.5 rounded-full">
                      Inactive
                    </span>
                  )}
                </div>
                <p className="text-sm text-on-surface/60 truncate">{deal.subtitle}</p>
              </div>

              {/* Price */}
              <span className="text-lg font-bold text-primary shrink-0">{deal.price}</span>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => { setEditing({ ...deal }); setIsNew(false) }}
                  className="p-2 rounded-lg hover:bg-surface-container-high text-on-surface/60 hover:text-on-surface transition-colors"
                  title="Edit"
                >
                  <span className="material-symbols-outlined text-[20px]">edit</span>
                </button>
                <button
                  onClick={() => run(deal.dealId, () => handleDelete(deal.dealId))}
                  disabled={isPending(deal.dealId)}
                  className="p-2 rounded-lg hover:bg-error-container/30 text-on-surface/60 hover:text-error transition-colors disabled:opacity-50"
                  title="Delete"
                >
                  {isPending(deal.dealId)
                    ? <Spinner size="md" />
                    : <span className="material-symbols-outlined text-[20px]">delete</span>}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
