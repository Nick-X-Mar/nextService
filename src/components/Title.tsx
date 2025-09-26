'use client'

import { ReactNode } from 'react'

interface TitleProps {
  children: ReactNode
  level?: 1 | 2 | 3 | 4 | 5 | 6
  variant?: 'page' | 'section' | 'card' | 'subtitle'
  className?: string
  highlight?: boolean
}

export default function Title({
  children,
  level = 1,
  variant = 'page',
  className = '',
  highlight = false
}: TitleProps) {
  // Base classes
  const baseClasses = 'font-bold text-gray-900'
  
  // Variant classes
  const variantClasses = {
    page: 'text-3xl md:text-4xl lg:text-5xl',
    section: 'text-2xl md:text-3xl',
    card: 'text-xl md:text-2xl',
    subtitle: 'text-lg md:text-xl'
  }
  
  // Highlight classes
  const highlightClasses = highlight ? 'text-orange-600' : ''
  
  const titleClasses = `${baseClasses} ${variantClasses[variant]} ${highlightClasses} ${className}`
  
  // Render appropriate heading element
  const headingProps = { className: titleClasses, children }
  
  switch (level) {
    case 1:
      return <h1 {...headingProps} />
    case 2:
      return <h2 {...headingProps} />
    case 3:
      return <h3 {...headingProps} />
    case 4:
      return <h4 {...headingProps} />
    case 5:
      return <h5 {...headingProps} />
    case 6:
      return <h6 {...headingProps} />
    default:
      return <h1 {...headingProps} />
  }
}
