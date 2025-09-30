'use client'

import { ReactNode } from 'react'
import { styles } from '@/styles/styles'

interface InputProps {
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search'
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: ReactNode
  error?: string
  disabled?: boolean
  required?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
  id?: string
  maxLength?: number
  minLength?: number
  pattern?: string
  autoComplete?: string
}

export default function Input({
  type = 'text',
  value,
  onChange,
  placeholder,
  label,
  error,
  disabled = false,
  required = false,
  size = 'md',
  className = '',
  id,
  maxLength,
  minLength,
  pattern,
  autoComplete
}: InputProps) {
  // Size classes using design system
  const sizeClasses = {
    sm: 'px-3 py-1.5',
    md: 'px-4 py-2', 
    lg: 'px-4 py-3'
  }
  
  const labelSizeClasses = {
    sm: '',
    md: '',
    lg: ''
  }
  
  // Use consistent input styling from design system
  const baseClasses = styles.input
  
  const inputClasses = `${baseClasses} ${sizeClasses[size]} ${
    error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''
  } ${className}`
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
  }
  
  return (
    <div className="w-full">
      {label && (
        <label 
          htmlFor={id}
          className={`${styles.label} ${labelSizeClasses[size]}`}
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <input
        id={id}
        type={type}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        maxLength={maxLength}
        minLength={minLength}
        pattern={pattern}
        autoComplete={autoComplete}
        className={inputClasses}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <p 
          id={id ? `${id}-error` : undefined}
          className="mt-1 text-sm text-red-600"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}
