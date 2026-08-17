'use client'

interface SegmentedControlProps {
  options: Array<{
    value: string
    label: string
  }>
  value: string
  onChange: (value: string) => void
  className?: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'orange'
}

export default function SegmentedControl({
  options,
  value,
  onChange,
  className = '',
  size = 'md',
  variant: _variant = 'default'
}: SegmentedControlProps) {
  // Horizontal padding tightens on narrow phones. `flex-1` alone doesn't stop a
  // segment from blowing past the screen: a flex item won't shrink below its
  // min-content width, so three Greek labels with counts pushed the whole
  // control wider than a 320px viewport. `min-w-0` removes that floor and
  // `leading-tight` lets a label take a second line rather than overflow.
  const sizeClasses = {
    sm: 'py-1.5 px-2 sm:px-3 text-xs',
    md: 'py-2.5 px-2 sm:px-4 text-sm',
    lg: 'py-3 px-4 sm:px-6 text-base'
  }

  const getButtonClasses = (isSelected: boolean) => {
    const base = `flex-1 min-w-0 leading-tight font-bold transition-all duration-200 ${sizeClasses[size]} active:scale-95`

    if (isSelected) {
      return `${base} bg-primary text-on-primary shadow-md shadow-primary/20 rounded-xl`
    }
    return `${base} text-secondary hover:text-on-surface rounded-xl`
  }

  return (
    <div className={`flex items-stretch bg-surface-container-highest rounded-xl p-1 w-full ${className}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={getButtonClasses(value === option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
