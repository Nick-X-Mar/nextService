'use client'

import { ReactNode } from 'react'
import { styles } from '@/styles/styles'

interface InputProps {
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search'
  value: string
  onChange: (value: string) => void
  onKeyPress?: (e: React.KeyboardEvent<HTMLInputElement>) => void
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
  onKeyPress,
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
  const sizeClasses = {
    sm: '!h-10 text-sm',
    md: '',
    lg: '!h-16 text-base'
  }

  const errorClasses = error ? 'ring-2 ring-error/50 bg-error-container/10' : ''

  const inputClasses = `${styles.input} ${sizeClasses[size]} ${errorClasses} ${className}`

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
  }

  return (
    <div className="w-full space-y-2">
      {label && (
        <label htmlFor={id} className={styles.label}>
          {label}
          {required && <span className="text-tertiary ml-1">*</span>}
        </label>
      )}
      <input
        id={id}
        type={type}
        value={value}
        onChange={handleChange}
        onKeyPress={onKeyPress}
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
          className="text-xs text-error font-medium"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}
