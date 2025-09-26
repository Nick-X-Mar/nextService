'use client'

import { useCallback } from 'react'

export interface ToastOptions {
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  message?: string
  duration?: number
}

export function useToast() {
  const showToast = useCallback((options: ToastOptions) => {
    if (typeof window !== 'undefined' && (window as any).showToast) {
      (window as any).showToast(options)
    } else {
      // Fallback to browser alert if toast system not available
      alert(`${options.title}${options.message ? `\n${options.message}` : ''}`)
    }
  }, [])

  const success = useCallback((title: string, message?: string) => {
    showToast({ type: 'success', title, message })
  }, [showToast])

  const error = useCallback((title: string, message?: string) => {
    showToast({ type: 'error', title, message })
  }, [showToast])

  const info = useCallback((title: string, message?: string) => {
    showToast({ type: 'info', title, message })
  }, [showToast])

  const warning = useCallback((title: string, message?: string) => {
    showToast({ type: 'warning', title, message })
  }, [showToast])

  return {
    showToast,
    success,
    error,
    info,
    warning
  }
}
