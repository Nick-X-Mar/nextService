'use client'

import { useEffect, useState } from 'react'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import { useToast } from '@/hooks/useToast'
import { useAsyncTask } from '@/hooks/useAsyncTask'
import { styles } from '@/styles/styles'

const extraServices = [
  { icon: 'car_rental', label: 'Όχημα Αντικατάστασης' },
  { icon: 'local_shipping', label: 'Παραλαβή από το σπίτι' },
  { icon: 'local_shipping', label: 'Παράδοση στο σπίτι' },
  { icon: 'credit_card', label: 'Πληρωμή με κάρτα' },
  { icon: 'receipt_long', label: 'Δωρεάν Εγγύηση Εργασίας' },
  { icon: 'schedule', label: 'Εξυπηρέτηση Σαββατοκύριακο' },
]
const presetLabels = new Set(extraServices.map((s) => s.label))

/**
 * The step after sign-up: what extra the shop offers its customers.
 *
 * Kept off the public registration form so visitors never see it. What is
 * picked here is saved as the garage's benefits — the "Παροχές" clients see
 * next to its offers, editable later under Προφίλ Συνεργείου.
 */
export default function ExtraServicesStep({ garageId }: { garageId: string }) {
  const [benefits, setBenefits] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState(false)
  const [customInput, setCustomInput] = useState('')
  const { success, error } = useToast()
  const { run, isPending } = useAsyncTask()
  const saving = isPending()

  useEffect(() => {
    let cancelled = false
    fetch(`/api/garage/${garageId}/`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        const current = data?.garage?.benefits
        if (Array.isArray(current)) setBenefits(current)
        setLoaded(true)
      })
      .catch(() => !cancelled && setLoaded(true))
    return () => {
      cancelled = true
    }
  }, [garageId])

  // Functional updates: two quick taps must not both start from the same list.
  const edit = (change: (current: string[]) => string[]) => {
    setBenefits(change)
    setSaved(false)
  }

  const toggle = (label: string) =>
    edit((current) => (current.includes(label) ? current.filter((b) => b !== label) : [...current, label]))

  const addCustom = () => {
    const trimmed = customInput.trim()
    if (trimmed) edit((current) => (current.includes(trimmed) ? current : [...current, trimmed]))
    setCustomInput('')
  }

  const save = () =>
    run(async () => {
      const res = await fetch(`/api/garage/${garageId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ benefits }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        error('Σφάλμα', data.error || 'Δεν αποθηκεύτηκαν οι υπηρεσίες. Δοκιμάστε ξανά.')
        return
      }
      if (Array.isArray(data.benefits)) setBenefits(data.benefits)
      setSaved(true)
      success('Αποθηκεύτηκε', 'Οι πελάτες θα βλέπουν αυτές τις υπηρεσίες δίπλα στις προσφορές σας.')
    })

  const custom = benefits.filter((b) => !presetLabels.has(b))

  return (
    <div className="w-full max-w-lg bg-surface-container-lowest rounded-2xl p-4 sm:p-6 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10 space-y-4">
      <div className="flex items-center gap-3 pb-4 border-b border-outline-variant/10">
        <div className="w-10 h-10 bg-surface-container rounded-lg flex items-center justify-center">
          <Icon name="star" filled className="text-primary" />
        </div>
        <div>
          <h2 className={styles.cardTitle}>Επιπλέον Υπηρεσίες</h2>
          <p className="text-xs text-on-surface-variant">Τι extra προσφέρετε στους πελάτες σας; (προαιρετικό)</p>
        </div>
      </div>

      {!loaded ? (
        <div className="flex justify-center py-6 text-primary">
          <Spinner size="md" />
        </div>
      ) : (
        <>
          {/* min-w-0 appears twice below: once on the chip so its grid
              column can shrink under the label's width, once on the label
              so it may wrap. Without them the longest labels spill out past
              the chip's rounded background on a phone. */}
          <div className="grid grid-cols-2 gap-2">
            {extraServices.map((service) => {
              const isSelected = benefits.includes(service.label)
              return (
                <button
                  key={service.label}
                  type="button"
                  onClick={() => toggle(service.label)}
                  disabled={saving}
                  className={`flex items-center gap-2 px-2.5 py-3 rounded-xl text-left transition-all active:scale-95 min-w-0 ${
                    isSelected
                      ? 'bg-primary/10 border-2 border-primary'
                      : 'bg-surface-container border-2 border-transparent hover:bg-surface-container-high'
                  }`}
                >
                  <Icon
                    name={service.icon}
                    size="sm"
                    className={`shrink-0 ${isSelected ? 'text-primary' : 'text-on-surface-variant/60'}`}
                  />
                  <span className={`text-xs font-bold min-w-0 break-words ${isSelected ? 'text-primary' : 'text-on-surface'}`}>
                    {service.label}
                  </span>
                </button>
              )
            })}
          </div>

          {custom.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {custom.map((cs) => (
                <div key={cs} className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-full px-3 py-1.5">
                  <span className="text-xs font-bold text-primary">{cs}</span>
                  <button
                    type="button"
                    onClick={() => edit((current) => current.filter((b) => b !== cs))}
                    disabled={saving}
                    aria-label={`Αφαίρεση: ${cs}`}
                    className="text-primary/60 hover:text-primary"
                  >
                    <Icon name="close" size="sm" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addCustom()
                }
              }}
              placeholder="Προσθέστε δική σας υπηρεσία..."
              maxLength={200}
              className={`${styles.input} flex-1`}
            />
            <button
              type="button"
              onClick={addCustom}
              disabled={!customInput.trim() || saving}
              aria-label="Προσθήκη υπηρεσίας"
              className="px-4 rounded-xl bg-primary text-on-primary font-bold text-sm disabled:opacity-30 transition-opacity active:scale-95"
            >
              <Icon name="add" size="sm" />
            </button>
          </div>

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className={`${styles.btnPrimary} w-full justify-center ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {saving ? <Spinner size="sm" /> : <Icon name={saved ? 'check' : 'save'} size="sm" />}
            {saved ? 'Αποθηκεύτηκε' : 'Αποθήκευση'}
          </button>
        </>
      )}
    </div>
  )
}
