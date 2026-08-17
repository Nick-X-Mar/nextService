'use client'

/**
 * The two-way pill used for every either/or vehicle attribute — καύσιμο, κιβώτιο,
 * κίνηση, turbo. Booleans on a vehicle are never "checked / unchecked": the car is
 * manual *or* automatic, and a checkbox makes the unticked half invisible. Both
 * options stay on screen so the answer is always readable at a glance.
 */
interface PillOption<T> {
  value: T
  label: string
}

interface PillToggleProps<T> {
  /** Uppercase micro-label above the control. Omit for a bare pill row. */
  label?: string
  options: [PillOption<T>, PillOption<T>]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
}

export default function PillToggle<T extends string | boolean>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: PillToggleProps<T>) {
  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
          {label}
        </label>
      )}
      <div className={`flex bg-surface-container p-1 rounded-full ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={option.value === value}
            className={
              option.value === value
                ? 'flex-1 py-2 rounded-full font-bold text-[10px] bg-primary text-on-primary shadow-sm text-center active:scale-95 transition-all'
                : 'flex-1 py-2 rounded-full font-bold text-[10px] text-secondary text-center active:scale-95 transition-all'
            }
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
