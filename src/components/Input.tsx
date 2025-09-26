'use client'

import { ReactNode } from 'react'

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
  // Size classes
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-4 py-3 text-lg'
  }
  
  const labelSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg'
  }
  
  const baseClasses = 'block w-full rounded-lg border border-gray-300 bg-white transition-colors duration-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500 focus:ring-opacity-20 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed'
  
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
          className={`block ${labelSizeClasses[size]} font-medium text-gray-700 mb-1`}
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
