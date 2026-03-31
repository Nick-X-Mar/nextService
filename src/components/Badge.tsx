'use client'

import { ReactNode } from 'react'

interface BadgeProps {
  children: ReactNode
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  dot?: boolean
}

export default function Badge({
  children,
  variant = 'default',
  size = 'md',
  className = '',
  dot = false
}: BadgeProps) {
  const baseClasses = 'inline-flex items-center font-bold rounded-full uppercase tracking-wider'

  const variantClasses = {
    default: 'bg-surface-container text-on-surface-variant',
    primary: 'bg-primary/10 text-primary',
    secondary: 'bg-secondary-container text-on-secondary-container',
    success: 'bg-green-100 text-green-800',
    warning: 'bg-amber-100 text-amber-800',
    danger: 'bg-red-100 text-red-800',
    info: 'bg-blue-100 text-blue-800'
  }

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-[11px]',
    lg: 'px-3 py-1.5 text-xs'
  }

  const dotColorClasses = {
    default: 'bg-on-surface-variant',
    primary: 'bg-primary',
    secondary: 'bg-secondary',
    success: 'bg-green-600',
    warning: 'bg-amber-600',
    danger: 'bg-red-600',
    info: 'bg-blue-600'
  }

  const badgeClasses = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`

  return (
    <span className={badgeClasses}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${dotColorClasses[variant]}`}></span>}
      {children}
    </span>
  )
}
