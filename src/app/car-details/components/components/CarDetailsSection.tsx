'use client'

import { useState, useEffect } from 'react'
import CarBrandModelSelector from './CarBrandModelSelector'
import ServiceCategoryModal from '@/components/ServiceCategoryModal'
import { loadFormData, saveFormData, startNewRequest } from '../../../../utils/formStorage'
import { getCategoryText } from '@/utils/categoryLabels'
import Icon from '@/components/ui/Icon'

export default function CarDetailsSection() {
  const [category, setCategory] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  // Reached with no category — a "Στείλε αίτημα" link, a bookmark, cleared storage —
  // the form used to let people fill in the whole car and only fail at the very end
  // with "Λείπουν: Κατηγορία". Ask first instead.
  useEffect(() => {
    // NEW_REQUEST_HREF: a "Στείλε αίτημα" link starts over instead of resuming whatever
    // draft this browser holds. The flag goes straight away, so a reload or "Επιστροφή"
    // from step 2 resumes the new draft rather than wiping it again.
    const params = new URLSearchParams(window.location.search)
    if (params.has('new')) {
      startNewRequest({})
      params.delete('new')
      const query = params.toString()
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
    }
    const saved = loadFormData().category || ''
    setCategory(saved)
    setPickerOpen(!saved)
    setLoaded(true)
  }, [])

  // Changing the category keeps everything else typed so far — it is the same draft.
  const chooseCategory = (value: string) => {
    saveFormData({ category: value })
    setCategory(value)
    setPickerOpen(false)
  }

  // Only render the badge when we have a real Greek label — an unmapped slug
  // would otherwise show up raw (e.g. "symplektis").
  const categoryLabel = category ? getCategoryText(category) : ''
  const hasLabel = categoryLabel !== category

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
        {hasLabel && (
          <div className="mt-4 inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full">
            <Icon name="build" size="sm" />
            <span className="text-xs font-bold">{categoryLabel}</span>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              aria-label="Αλλαγή κατηγορίας"
              className="ml-1 hover:text-primary-container active:scale-95 transition-transform"
            >
              <Icon name="edit" size="sm" />
            </button>
          </div>
        )}

        {loaded && !category && (
          <div className="mt-6 bg-surface-container-lowest rounded-3xl shadow-[0_4px_24px_rgba(27,28,28,0.04)] p-6 text-center">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Icon name="build" className="text-primary" size="md" />
            </div>
            <p className="text-sm font-bold text-on-surface">Διάλεξε πρώτα τι χρειάζεται το αυτοκίνητό σου</p>
            <p className="mt-1 text-xs text-on-surface-variant">
              Τα συνεργεία κάνουν προσφορά για συγκεκριμένη εργασία.
            </p>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-full machined-gradient text-on-primary px-5 py-2.5 text-sm font-bold shadow-lg shadow-primary/20 active:scale-95 transition-transform"
            >
              <Icon name="list" size="sm" />
              Επιλογή εργασίας
            </button>
          </div>
        )}

        {category && <CarBrandModelSelector category={category} />}
      </div>

      <ServiceCategoryModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={chooseCategory}
      />
    </section>
  )
}
