'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/Modal'
import Icon from '@/components/ui/Icon'
import { saveFormData } from '@/utils/formStorage'

const categories = [
  { icon: 'settings', label: 'Συμπλέκτης', value: 'symplektis' },
  { icon: 'conveyor_belt', label: 'Ιμάντας', value: 'imantas' },
  { icon: 'format_paint', label: 'Ολική Βαφή', value: 'oliki-vafi' },
  { icon: 'brush', label: 'Μερική Βαφή', value: 'meriki-vafi' },
  { icon: 'sensors', label: 'Αισθητήρες', value: 'aisthitires' },
  { icon: 'oil_barrel', label: 'Αλλαγή λαδιών', value: 'allagi-ladion' },
]

interface ServiceCategoryModalProps {
  isOpen: boolean
  onClose: () => void
  /** Optional extra form data to save alongside the category (e.g. pre-filled vehicle data) */
  extraFormData?: Record<string, unknown>
}

export default function ServiceCategoryModal({ isOpen, onClose, extraFormData }: ServiceCategoryModalProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')

  const filtered = search
    ? categories.filter(c => c.label.toLowerCase().includes(search.toLowerCase()))
    : categories

  const selectCategory = (value: string) => {
    saveFormData({ ...extraFormData, category: value })
    onClose()
    router.push('/car-details')
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Τι χρειάζεται το αυτοκίνητό σου;"
      size="sm"
      closeOnBackdropClick
    >
      {/* Search */}
      <div className="relative mb-4">
        <Icon name="search" size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Αναζήτηση..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-container border border-outline-variant/20 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
          autoFocus
        />
      </div>

      {/* Category list */}
      <div className="space-y-1">
        {filtered.map(cat => (
          <button
            key={cat.value}
            onClick={() => selectCategory(cat.value)}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors"
          >
            <div className="flex items-center gap-3">
              <Icon name={cat.icon} size="sm" className="text-on-surface-variant/60" />
              <span className="text-sm font-bold text-on-surface">{cat.label}</span>
            </div>
            <Icon name="arrow_forward" size="sm" className="text-on-surface-variant/30" />
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-secondary text-center py-4">Δεν βρέθηκαν αποτελέσματα</p>
        )}
      </div>
    </Modal>
  )
}
