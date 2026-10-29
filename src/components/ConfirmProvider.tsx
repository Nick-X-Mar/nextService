'use client'

import { createContext, useCallback, useState, type ReactNode } from 'react'
import Modal from './Modal'
import Button from './Button'

export interface ConfirmOptions {
  title?: string
  message?: string
  /** Defaults to «Συνέχεια». */
  confirmLabel?: string
  /** Defaults to «Άκυρο». */
  cancelLabel?: string
  /** Red confirm button, for anything that deletes, cancels or hides. */
  danger?: boolean
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

interface PendingConfirm extends Required<Omit<ConfirmOptions, 'message'>> {
  message?: string
  resolve: (ok: boolean) => void
}

export const ConfirmContext = createContext<ConfirmFn | null>(null)

/**
 * Promise-based replacement for `window.confirm()`, read through `useConfirm()`:
 *
 *   const confirm = useConfirm()
 *   if (!(await confirm({ title: 'Ακύρωση αιτήματος;', danger: true }))) return
 *
 * The native dialog can't be styled, shows the site's address as its title,
 * and on iOS Safari can be suppressed altogether after a few prompts.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null)

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setPending({
          title: options.title || 'Επιβεβαίωση',
          message: options.message,
          confirmLabel: options.confirmLabel || 'Συνέχεια',
          cancelLabel: options.cancelLabel || 'Άκυρο',
          danger: options.danger ?? false,
          resolve,
        })
      }),
    []
  )

  const answer = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        isOpen={!!pending}
        onClose={() => answer(false)}
        title={pending?.title || ''}
        size="sm"
        closeOnBackdropClick
        footer={
          <>
            <Button variant="outline" onClick={() => answer(false)}>
              {pending?.cancelLabel}
            </Button>
            <Button variant={pending?.danger ? 'danger' : 'primary'} onClick={() => answer(true)}>
              {pending?.confirmLabel}
            </Button>
          </>
        }
      >
        {pending?.message && <p className="text-base text-secondary whitespace-pre-line">{pending.message}</p>}
      </Modal>
    </ConfirmContext.Provider>
  )
}
