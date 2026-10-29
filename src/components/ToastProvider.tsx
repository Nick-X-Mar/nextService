'use client'

import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Icon from '@/components/ui/Icon'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastOptions {
  type: ToastType
  title: string
  message?: string
  /** Milliseconds on screen; 0 keeps it until closed. Defaults by type. */
  duration?: number
}

export interface ToastApi {
  showToast: (options: ToastOptions) => void
  success: (title: string, message?: string) => void
  error: (title: string, message?: string) => void
  info: (title: string, message?: string) => void
  warning: (title: string, message?: string) => void
}

interface ToastItem extends ToastOptions {
  id: number
}

// Errors stay longest: they are the ones the user has to read and act on.
const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 3500,
  info: 4000,
  warning: 5000,
  error: 6000,
}

const STYLES: Record<ToastType, { icon: string; iconClass: string; surface: string }> = {
  success: { icon: 'check_circle', iconClass: 'text-green-600', surface: 'bg-green-50 border-green-200' },
  error: { icon: 'cancel', iconClass: 'text-error', surface: 'bg-error-container border-error/20' },
  warning: { icon: 'warning', iconClass: 'text-amber-600', surface: 'bg-amber-50 border-amber-200' },
  info: { icon: 'info', iconClass: 'text-blue-600', surface: 'bg-blue-50 border-blue-200' },
}

export const ToastContext = createContext<ToastApi | null>(null)

let toastSeq = 0

/**
 * App-wide toasts, read through `useToast()`.
 *
 * Rendered through a portal on `document.body`, so a toast fired from inside a
 * modal or an `overflow-hidden` card is never clipped by it. Toasts stack:
 * bottom-centre above the BottomNav on a phone, top-right under the header on
 * desktop.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [mounted, setMounted] = useState(false)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    setMounted(true)
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      pending.clear()
    }
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
  }, [])

  const showToast = useCallback(
    (options: ToastOptions) => {
      const id = ++toastSeq
      setToasts((current) => [...current, { ...options, id }])
      const duration = options.duration ?? DEFAULT_DURATION[options.type]
      if (duration > 0) timers.current.set(id, setTimeout(() => dismiss(id), duration))
    },
    [dismiss]
  )

  const api = useMemo<ToastApi>(
    () => ({
      showToast,
      success: (title, message) => showToast({ type: 'success', title, message }),
      error: (title, message) => showToast({ type: 'error', title, message }),
      info: (title, message) => showToast({ type: 'info', title, message }),
      warning: (title, message) => showToast({ type: 'warning', title, message }),
    }),
    [showToast]
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted &&
        toasts.length > 0 &&
        createPortal(
          <div className="fixed inset-x-0 bottom-24 z-[100] flex flex-col items-center gap-2 px-4 pb-[env(safe-area-inset-bottom)] pointer-events-none md:inset-x-auto md:bottom-auto md:top-20 md:right-4 md:items-end md:px-0 md:pb-0">
            {toasts.map((toast) => (
              <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  )
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(timer)
  }, [])

  const close = () => {
    setVisible(false)
    setTimeout(onDismiss, 200)
  }

  const style = STYLES[toast.type]

  return (
    <div
      role={toast.type === 'error' || toast.type === 'warning' ? 'alert' : 'status'}
      className={`pointer-events-auto w-full max-w-md ${style.surface} border rounded-xl shadow-lg transition-all duration-200 ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 md:translate-y-0 md:translate-x-3'
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        <Icon name={style.icon} filled size="md" className={`shrink-0 mt-0.5 ${style.iconClass}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-on-surface">{toast.title}</p>
          {toast.message && (
            <p className="mt-1 text-sm text-secondary whitespace-pre-line break-words">{toast.message}</p>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Κλείσιμο"
          className="shrink-0 -mr-1 -mt-1 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-container transition-colors active:scale-95"
        >
          <Icon name="close" size="sm" className="text-secondary" />
        </button>
      </div>
    </div>
  )
}
