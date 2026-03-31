'use client'

import { ReactNode } from 'react'
import { styles } from '@/styles/styles'

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
  const variantClasses = {
    default: styles.card,
    outlined: 'bg-surface-container-lowest border-2 border-outline-variant/30 rounded-xl',
    elevated: styles.cardHover,
    simple: styles.cardSimple
  }

  const paddingClasses = {
    none: '!p-0',
    sm: '!p-3',
    md: '!p-5',
    lg: '!p-8'
  }

  const hoverClasses = hover ? 'hover:shadow-2xl hover:shadow-on-surface/5 cursor-pointer transition-all duration-300' : ''
  const clickClasses = onClick ? 'cursor-pointer' : ''

  const cardClasses = `${variantClasses[variant]} ${paddingClasses[padding]} ${hoverClasses} ${clickClasses} ${className}`

  return (
    <div className={cardClasses} onClick={onClick}>
      {children}
    </div>
  )
}
