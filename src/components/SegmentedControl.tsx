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
  variant = 'default'
}: SegmentedControlProps) {
  const sizeClasses = {
    sm: 'py-1 px-3 text-xs',
    md: 'py-2 px-4 text-sm',
    lg: 'py-3 px-6 text-base'
  }

  const containerSizeClasses = {
    sm: 'p-0.5',
    md: 'p-1',
    lg: 'p-1.5'
  }

  const getVariantClasses = (isSelected: boolean) => {
    if (variant === 'orange') {
      return isSelected
        ? 'bg-orange-500 text-white shadow-sm'
        : 'text-orange-600 hover:text-orange-700'
    }
    
    // Default variant
    return isSelected
      ? 'bg-blue-500 text-white shadow-sm'
      : 'text-blue-600 hover:text-blue-700'
  }

  const getButtonClasses = (index: number, isSelected: boolean) => {
    const baseClasses = `flex-1 font-medium transition-all duration-200 ${sizeClasses[size]} ${getVariantClasses(isSelected)}`
    
    if (options.length === 2) {
      // Two options - rounded corners on outer edges only
      if (index === 0) {
        return `${baseClasses} rounded-l-md`
      } else {
        return `${baseClasses} rounded-r-md`
      }
    } else {
      // Multiple options - rounded corners on outer edges only
      if (index === 0) {
        return `${baseClasses} rounded-l-md`
      } else if (index === options.length - 1) {
        return `${baseClasses} rounded-r-md`
      } else {
        return baseClasses
      }
    }
  }

  return (
    <div className={`flex items-center justify-center bg-gray-100 rounded-lg w-full ${containerSizeClasses[size]} ${className}`}>
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={getButtonClasses(index, value === option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
