'use client'

import { ReactNode, useState } from 'react'
import { styles } from '@/styles/styles'
import Spinner from './Spinner'

interface ButtonProps {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  /** Force the spinner on — for submit buttons driven by the form's own state. */
  loading?: boolean
  /** Returning a promise makes the button spin until it settles, on its own. */
  onClick?: () => void | Promise<unknown>
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
  // Set when `onClick` hands back a promise, so callers get a spinner without
  // wiring up an `isLoading` state of their own.
  const [busy, setBusy] = useState(false)
  const isBusy = loading || busy

  const handleClick = () => {
    if (!onClick || isBusy) return
    const result = onClick()
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      setBusy(true)
      ;(result as Promise<unknown>).finally(() => setBusy(false))
    }
  }

  const variantClasses = {
    primary: styles.btnPrimary,
    secondary: styles.btnSecondary,
    danger: styles.btnDanger,
    success: 'bg-green-600 text-white hover:bg-green-700 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors duration-200 active:scale-95 flex items-center gap-2',
    outline: styles.btnOutline,
    ghost: styles.btnGhost,
  }

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: '',
    lg: 'px-8 py-4 text-base'
  }

  const widthClasses = fullWidth ? 'w-full justify-center' : ''
  const disabledClasses = disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
  const busyClasses = isBusy ? 'opacity-70 cursor-wait' : ''

  const buttonClasses = `${variantClasses[variant]} ${sizeClasses[size]} ${widthClasses} ${disabledClasses} ${busyClasses} ${className}`

  return (
    <button
      type={type}
      onClick={handleClick}
      disabled={disabled || isBusy}
      aria-busy={isBusy}
      className={buttonClasses}
    >
      {isBusy && <Spinner size={size === 'lg' ? 'md' : 'sm'} />}
      {children}
    </button>
  )
}
