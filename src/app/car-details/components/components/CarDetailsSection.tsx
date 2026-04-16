'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import CarBrandModelSelector from './CarBrandModelSelector'
import { loadFormData } from '../../../../utils/formStorage'
import Icon from '@/components/ui/Icon'

export default function CarDetailsSection() {
  const router = useRouter()
  const [category, setCategory] = useState('')

  useEffect(() => {
    const data = loadFormData()
    setCategory(data.category || '')
  }, [])

  const categoryLabels: Record<string, string> = {
    service: 'Service',
    kteo: 'ΚΤΕΟ',
    elastika: 'Ελαστικά',
    fanopeia: 'Φανοποιεία',
    'oliki-vafi': 'Ολική Βαφή',
    'meriki-vafi': 'Μερική Βαφή',
    oils: 'Λάδια',
    disk: 'Δίσκος',
  }

  return (
    <section className="pb-12 pt-0">
      <div className="max-w-lg mx-auto px-5">
        {/* Step indicator */}
        <div className="flex gap-2 mb-6">
          <div className="flex-1 h-1 rounded-full bg-primary-container" />
          <div className="flex-1 h-1 rounded-full bg-surface-container-highest" />
          <div className="flex-1 h-1 rounded-full bg-surface-container-highest" />
        </div>

        {/* Page title */}
        <h1 className="text-2xl font-black tracking-tight text-on-surface">
          Στοιχεία <span className="text-primary">Οχήματος</span>
        </h1>
        <p className="mt-2 text-sm text-secondary leading-relaxed">
          Συμπληρώστε τα στοιχεία του οχήματος και την περιγραφή
        </p>

        {/* Selected category badge */}
        {category && (
          <div className="mt-4 inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full">
            <Icon name="build" size="sm" />
            <span className="text-xs font-bold">{categoryLabels[category] || category}</span>
            <button onClick={() => router.push('/')} className="ml-1 hover:text-primary-container">
              <Icon name="edit" size="sm" />
            </button>
          </div>
        )}

        <CarBrandModelSelector
          selectedBrand=""
          selectedModel=""
          onBrandChange={() => {}}
          onModelChange={() => {}}
        />
      </div>
    </section>
  )
}
