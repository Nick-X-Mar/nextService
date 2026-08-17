'use client'

import { useCallback, useEffect, useState } from 'react'

// User preferences for ambient (out-of-tab) notifications about new service
// requests. Persisted to localStorage so each garage user can opt in/out
// independently on their machine.
const SOUND_PREF_KEY = 'garageDashboard.newRequestSound'
const BROWSER_NOTIF_PREF_KEY = 'garageDashboard.newRequestBrowserNotif'

/**
 * One shared AudioContext for the tab. Browsers start it suspended until the
 * user has interacted with the page, so it is created and resumed on the first
 * click/keypress (`primeAudio`) rather than at the moment a request lands —
 * a context built inside the AppSync callback never gets to make a sound.
 */
let sharedCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return null
  try {
    if (!sharedCtx) sharedCtx = new AudioCtx()
    return sharedCtx
  } catch {
    return null
  }
}

function primeAudio() {
  const ctx = getCtx()
  if (ctx?.state === 'suspended') ctx.resume().catch(() => {})
}

// Short, low-pitched chime synthesised on the fly so we don't have to ship a
// binary asset. Uses WebAudio with a quick attack/release envelope to avoid
// clicks.
function playChime() {
  const ctx = getCtx()
  if (!ctx) return

  try {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
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
    // The context is shared and stays open — closing it here would mean paying
    // the (gesture-gated) setup cost again on the next request.
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

  // Arm the audio on the first interaction of the session — after that a chime
  // can play at any moment, including while the tab sits in the background.
  useEffect(() => {
    const arm = () => primeAudio()
    window.addEventListener('pointerdown', arm, { once: true })
    window.addEventListener('keydown', arm, { once: true })
    return () => {
      window.removeEventListener('pointerdown', arm)
      window.removeEventListener('keydown', arm)
    }
  }, [])

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

  // Preferences are read from storage at call time, not from this instance's
  // state: the header bell and the settings screen each hold their own copy of
  // the hook, and muting in one has to silence the other.
  const notify = useCallback((details: NotifyDetails) => {
    if (readBoolPref(SOUND_PREF_KEY, true)) {
      playChime()
    }

    if (readBoolPref(BROWSER_NOTIF_PREF_KEY, false)
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
