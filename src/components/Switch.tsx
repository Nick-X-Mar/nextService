'use client'

import { ReactNode } from 'react'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: ReactNode
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
  id?: string
}

export default function Switch({
  checked,
  onChange,
  label,
  disabled = false,
  size = 'md',
  className = '',
  id
}: SwitchProps) {
  // Size classes
  const sizeClasses = {
    sm: {
      container: 'h-5 w-9',
      thumb: 'h-4 w-4',
      translate: 'translate-x-4'
    },
    md: {
      container: 'h-6 w-11',
      thumb: 'h-5 w-5',
      translate: 'translate-x-5'
    },
    lg: {
      container: 'h-7 w-12',
      thumb: 'h-6 w-6',
      translate: 'translate-x-5'
    }
  }
  
  const labelSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg'
  }
  
  const containerClasses = `${sizeClasses[size].container} relative inline-flex flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 ${
    checked ? 'bg-orange-600' : 'bg-gray-200'
  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`
  
  const thumbClasses = `${sizeClasses[size].thumb} pointer-events-none inline-block transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
    checked ? sizeClasses[size].translate : 'translate-x-0'
  }`
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked)
  }
  
  return (
    <div className={`flex items-center ${className}`}>
      <button
        type="button"
        className={containerClasses}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        role="switch"
        aria-checked={checked}
        aria-labelledby={id ? `${id}-label` : undefined}
      >
        <span className="sr-only">Toggle</span>
        <span className={thumbClasses}></span>
      </button>
      {label && (
        <label 
          id={id ? `${id}-label` : undefined}
          className={`ml-3 ${labelSizeClasses[size]} text-gray-700 cursor-pointer select-none`}
          onClick={() => !disabled && onChange(!checked)}
        >
          {label}
        </label>
      )}
    </div>
  )
}
