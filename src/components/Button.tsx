'use client'

import { ReactNode } from 'react'
import { styles } from '@/styles/styles'

interface ButtonProps {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  loading?: boolean
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
  className?: string
  fullWidth?: boolean
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  onClick,
  type = 'button',
  className = '',
  fullWidth = false
}: ButtonProps) {
  // Use design system styles
  const variantClasses = {
    primary: styles.btnPrimary,
    secondary: styles.btnSecondary,
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center gap-2',
    success: 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500 px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center gap-2',
    outline: styles.btnOutline,
    ghost: 'text-orange-500 hover:text-orange-600 px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center gap-2'
  }
  
  // Size classes (just padding adjustments)
  const sizeClasses = {
    sm: 'px-3 py-1.5',
    md: '', // Default from design system
    lg: 'px-6 py-3'
  }
  
  // Width classes
  const widthClasses = fullWidth ? 'w-full' : ''
  
  const buttonClasses = `${variantClasses[variant]} ${sizeClasses[size]} ${widthClasses} ${className}`
  
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={buttonClasses}
    >
      {loading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {children}
    </button>
  )
}
