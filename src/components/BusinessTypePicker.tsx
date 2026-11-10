'use client'

import Icon from '@/components/ui/Icon'
import { BUSINESS_TYPES, businessTypes, type BusinessType } from '@/types/businessTypes'

interface BusinessTypePickerProps {
  value: BusinessType[]
  onChange: (value: BusinessType[]) => void
  disabled?: boolean
}

/**
 * Συνεργείο / Φανοποιείο / Βουλκανιζατέρ, as many as apply — the registration
 * form and the garage's profile are this one control. One per row on a phone,
 * where "Βουλκανιζατέρ" does not fit a third of the width.
 */
export default function BusinessTypePicker({ value, onChange, disabled = false }: BusinessTypePickerProps) {
  const toggle = (type: BusinessType) =>
    onChange(businessTypes(value.includes(type) ? value.filter((t) => t !== type) : [...value, type]))

  return (
    <div role="group" aria-label="Τύπος επιχείρησης" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {BUSINESS_TYPES.map((type) => {
        const selected = value.includes(type.value)
        return (
          <button
            key={type.value}
            type="button"
            onClick={() => toggle(type.value)}
            disabled={disabled}
            aria-pressed={selected}
            className={`flex items-center gap-2.5 px-3 py-3 rounded-xl text-left transition-all active:scale-95 min-w-0 disabled:opacity-50 border-2 ${
              selected
                ? 'bg-primary/10 border-primary'
                : 'bg-surface-container border-transparent hover:bg-surface-container-high'
            }`}
          >
            <Icon name={type.icon} size="sm" className={`shrink-0 ${selected ? 'text-primary' : 'text-on-surface-variant/60'}`} />
            <span className={`flex-1 text-sm font-bold min-w-0 ${selected ? 'text-primary' : 'text-on-surface'}`}>{type.label}</span>
            <Icon
              name={selected ? 'check_box' : 'check_box_outline_blank'}
              size="sm"
              filled={selected}
              className={`shrink-0 ${selected ? 'text-primary' : 'text-on-surface-variant/40'}`}
            />
          </button>
        )
      })}
    </div>
  )
}
