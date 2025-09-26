'use client'

import { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  variant?: 'default' | 'outlined' | 'elevated' | 'simple'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  className?: string
  onClick?: () => void
  hover?: boolean
}

export default function Card({
  children,
  variant = 'default',
  padding = 'md',
  className = '',
  onClick,
  hover = false
}: CardProps) {
  // Base classes
  const baseClasses = 'rounded-lg transition-all duration-200'
  
  // Variant classes
  const variantClasses = {
    default: 'bg-white border border-gray-200',
    outlined: 'bg-white border-2 border-gray-300',
    elevated: 'bg-white shadow-lg border border-gray-100',
    simple: 'bg-gray-50 border border-gray-200'
  }
  
  // Padding classes
  const paddingClasses = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6'
  }
  
  // Hover classes
  const hoverClasses = hover ? 'hover:shadow-md hover:border-gray-300 cursor-pointer' : ''
  
  // Click classes
  const clickClasses = onClick ? 'cursor-pointer' : ''
  
  const cardClasses = `${baseClasses} ${variantClasses[variant]} ${paddingClasses[padding]} ${hoverClasses} ${clickClasses} ${className}`
  
  return (
    <div 
      className={cardClasses}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
