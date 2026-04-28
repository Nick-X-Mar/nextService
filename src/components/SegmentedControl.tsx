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
  const sizeClasses = {
    sm: 'py-1.5 px-3 text-xs',
    md: 'py-2.5 px-4 text-sm',
    lg: 'py-3 px-6 text-base'
  }

  const getButtonClasses = (isSelected: boolean) => {
    const base = `flex-1 font-bold transition-all duration-200 ${sizeClasses[size]} active:scale-95`

    if (isSelected) {
      return `${base} bg-primary text-on-primary shadow-md shadow-primary/20 rounded-xl`
    }
    return `${base} text-secondary hover:text-on-surface rounded-xl`
  }

  return (
    <div className={`flex items-center bg-surface-container-highest rounded-xl p-1 w-full ${className}`}>
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
