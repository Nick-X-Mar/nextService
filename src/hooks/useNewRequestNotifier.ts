'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// User preferences for ambient (out-of-tab) notifications about new service
// requests. Persisted to localStorage so each garage user can opt in/out
// independently on their machine.
const SOUND_PREF_KEY = 'garageDashboard.newRequestSound'
const BROWSER_NOTIF_PREF_KEY = 'garageDashboard.newRequestBrowserNotif'

// Short, low-pitched chime synthesised on the fly so we don't have to ship a
// binary asset. Uses WebAudio with a quick attack/release envelope to avoid
// clicks.
function playChime() {
  if (typeof window === 'undefined') return
  const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return

  try {
    const ctx = new AudioCtx()
    const now = ctx.currentTime
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, now + start)
      gain.gain.linearRampToValueAtTime(0.18, now + start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + start)
      osc.stop(now + start + duration + 0.05)
    }
    playTone(660, 0, 0.18)
    playTone(880, 0.12, 0.22)

    // Free the context once playback ends.
    setTimeout(() => { ctx.close().catch(() => {}) }, 600)
  } catch (error) {
    console.warn('[useNewRequestNotifier] Could not play chime:', error)
  }
}

function readBoolPref(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return fallback
    return raw === 'true'
  } catch {
    return fallback
  }
}

function writeBoolPref(key: string, value: boolean) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(key, String(value)) } catch { /* ignore */ }
}

interface NotifyDetails {
  category: string
  vehicle?: string
}

export function useNewRequestNotifier() {
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => readBoolPref(SOUND_PREF_KEY, true))
  const [browserNotifEnabled, setBrowserNotifEnabledState] = useState<boolean>(() => readBoolPref(BROWSER_NOTIF_PREF_KEY, false))
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'denied'
    return Notification.permission
  })

  // Refs let `notify` stay referentially stable while still reading the
  // latest preference values.
  const soundEnabledRef = useRef(soundEnabled)
  const browserNotifEnabledRef = useRef(browserNotifEnabled)
  useEffect(() => { soundEnabledRef.current = soundEnabled }, [soundEnabled])
  useEffect(() => { browserNotifEnabledRef.current = browserNotifEnabled }, [browserNotifEnabled])

  const setSoundEnabled = useCallback((value: boolean) => {
    setSoundEnabledState(value)
    writeBoolPref(SOUND_PREF_KEY, value)
  }, [])

  const setBrowserNotifEnabled = useCallback(async (value: boolean) => {
    if (value && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try {
        const result = await Notification.requestPermission()
        setPermission(result)
        if (result !== 'granted') {
          // User declined — keep the toggle off to match reality.
          setBrowserNotifEnabledState(false)
          writeBoolPref(BROWSER_NOTIF_PREF_KEY, false)
          return
        }
      } catch {
        setBrowserNotifEnabledState(false)
        writeBoolPref(BROWSER_NOTIF_PREF_KEY, false)
        return
      }
    }
    setBrowserNotifEnabledState(value)
    writeBoolPref(BROWSER_NOTIF_PREF_KEY, value)
  }, [])

  const notify = useCallback((details: NotifyDetails) => {
    if (soundEnabledRef.current) {
      playChime()
    }

    if (browserNotifEnabledRef.current
      && typeof window !== 'undefined'
      && typeof Notification !== 'undefined'
      && Notification.permission === 'granted'
      && document.visibilityState !== 'visible'
    ) {
      try {
        const body = details.vehicle
          ? `${details.category} — ${details.vehicle}`
          : details.category
        new Notification('Νεο αιτημα', { body, tag: 'next-service-new-request' })
      } catch (error) {
        console.warn('[useNewRequestNotifier] Could not show browser notification:', error)
      }
    }
  }, [])

  return {
    notify,
    soundEnabled,
    setSoundEnabled,
    browserNotifEnabled,
    setBrowserNotifEnabled,
    browserNotifSupported: typeof Notification !== 'undefined',
    browserNotifPermission: permission,
  }
}
