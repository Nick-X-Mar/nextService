'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

const POLL_INTERVAL_MS = 30000

/**
 * Watches a pending garage's validation state so the UI flips the moment an
 * admin activates it — the garage shouldn't have to guess when to reload.
 * Polls while the tab is visible and re-checks immediately on focus.
 */
export function useGarageApprovalWatch(enabled: boolean, onApproved?: () => void) {
  const { garage, refreshGarage } = useAuth()
  const [isChecking, setIsChecking] = useState(false)
  const garageId = garage?.id

  const onApprovedRef = useRef(onApproved)
  onApprovedRef.current = onApproved

  const check = useCallback(async (manual: boolean) => {
    if (!garageId) return
    if (manual) setIsChecking(true)
    try {
      // Deliberately not refreshGarage() as the probe: it clears the session on
      // any network hiccup. Ask /api/auth/me first and only sync the auth
      // context once the flag has actually flipped.
      const response = await fetch('/api/auth/me/')
      if (!response.ok) return
      const data = await response.json()
      if (data?.authenticated && data.user?.isActive) {
        await refreshGarage(garageId)
        onApprovedRef.current?.()
      }
    } catch {
      // Offline or transient failure — the next tick tries again.
    } finally {
      if (manual) setIsChecking(false)
    }
  }, [garageId, refreshGarage])

  const checkNow = useCallback(() => check(true), [check])

  useEffect(() => {
    if (!enabled || !garageId) return

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') check(false)
    }, POLL_INTERVAL_MS)

    const recheck = () => {
      if (document.visibilityState === 'visible') check(false)
    }
    document.addEventListener('visibilitychange', recheck)
    window.addEventListener('focus', recheck)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', recheck)
      window.removeEventListener('focus', recheck)
    }
  }, [enabled, garageId, check])

  return { checkNow, isChecking }
}
