'use client'

import { useContext } from 'react'
import { ToastContext, type ToastApi } from '@/components/ToastProvider'

export type { ToastOptions } from '@/components/ToastProvider'

const alertText = (title: string, message?: string) => `${title}${message ? `\n${message}` : ''}`

// Only reachable outside <ToastProvider> (it wraps the whole app in the root
// layout), so a stray call still reaches the user instead of vanishing.
const fallback: ToastApi = {
  showToast: ({ title, message }) => alert(alertText(title, message)),
  success: (title, message) => alert(alertText(title, message)),
  error: (title, message) => alert(alertText(title, message)),
  info: (title, message) => alert(alertText(title, message)),
  warning: (title, message) => alert(alertText(title, message)),
}

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? fallback
}
