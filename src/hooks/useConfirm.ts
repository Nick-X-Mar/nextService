'use client'

import { useContext } from 'react'
import { ConfirmContext, type ConfirmFn } from '@/components/ConfirmProvider'

export type { ConfirmOptions } from '@/components/ConfirmProvider'

// Only reachable outside <ConfirmProvider>, which wraps the whole app.
const fallback: ConfirmFn = ({ title, message }) =>
  Promise.resolve(window.confirm(`${title || 'Επιβεβαίωση'}${message ? `\n${message}` : ''}`))

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext) ?? fallback
}
