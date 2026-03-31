'use client'

interface IconProps {
  name: string
  filled?: boolean
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  onClick?: () => void
}

const sizeMap = {
  sm: 'text-sm',
  md: 'text-xl',
  lg: 'text-2xl',
  xl: 'text-4xl',
}

export default function Icon({ name, filled = false, className = '', size = 'md', onClick }: IconProps) {
  return (
    <span
      className={`material-symbols-outlined ${sizeMap[size]} ${className}`}
      style={filled ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" } : undefined}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      {name}
    </span>
  )
}
