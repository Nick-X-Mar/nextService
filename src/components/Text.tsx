'use client'

import { ReactNode } from 'react'

interface TextProps {
  children: ReactNode
  variant?: 'body' | 'small' | 'caption' | 'lead'
  color?: 'default' | 'muted' | 'primary' | 'success' | 'warning' | 'danger'
  weight?: 'normal' | 'medium' | 'semibold' | 'bold'
  className?: string
  as?: 'p' | 'span' | 'div' | 'label'
}

export default function Text({
  children,
  variant = 'body',
  color = 'default',
  weight = 'normal',
  className = '',
  as: Component = 'p'
}: TextProps) {
  // Base classes
  const baseClasses = 'leading-relaxed'
  
  // Variant classes
  const variantClasses = {
    body: 'text-base',
    small: 'text-sm',
    caption: 'text-xs',
    lead: 'text-lg'
  }
  
  // Color classes
  const colorClasses = {
    default: 'text-gray-900',
    muted: 'text-gray-600',
    primary: 'text-orange-600',
    success: 'text-green-600',
    warning: 'text-yellow-600',
    danger: 'text-red-600'
  }
  
  // Weight classes
  const weightClasses = {
    normal: 'font-normal',
    medium: 'font-medium',
    semibold: 'font-semibold',
    bold: 'font-bold'
  }
  
  const textClasses = `${baseClasses} ${variantClasses[variant]} ${colorClasses[color]} ${weightClasses[weight]} ${className}`
  
  return (
    <Component className={textClasses}>
      {children}
    </Component>
  )
}
