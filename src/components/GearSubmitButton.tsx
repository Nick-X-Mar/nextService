'use client'

import { useRef, useState } from 'react'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'

interface GearSubmitButtonProps {
  label?: string
  loadingLabel?: string
  disabled?: boolean
  isLoading?: boolean
  onClick: () => void | Promise<void>
  className?: string
}

// How long the gear rolls before the action fires.
const ROLL_MS = 600

export default function GearSubmitButton({
  label = 'ΣΥΝΕΧΕΙΑ',
  loadingLabel = 'Αποστολή...',
  disabled = false,
  isLoading = false,
  onClick,
  className = '',
}: GearSubmitButtonProps) {
  const gearRef = useRef<HTMLDivElement>(null)
  // Set synchronously on the first click and held until the action settles. The
  // button used to schedule `onClick` 600ms out with nothing guarding it, so every
  // click inside that window queued another submit — two taps, two requests, and
  // every garage emailed twice.
  const inFlight = useRef(false)
  const [rolling, setRolling] = useState(false)

  const isBusy = isLoading || rolling
  const isDisabled = disabled || isBusy

  const handleClick = () => {
    if (disabled || isLoading || inFlight.current) return
    inFlight.current = true
    setRolling(true)

    const gear = gearRef.current
    if (gear) {
      gear.classList.remove('animate-gear-roll')
      void gear.offsetWidth
      gear.classList.add('animate-gear-roll')
    }

    setTimeout(async () => {
      try {
        await onClick()
      } finally {
        inFlight.current = false
        setRolling(false)
      }
    }, ROLL_MS)
  }

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      aria-busy={isBusy}
      className={`relative w-full h-14 rounded-full flex items-center font-bold text-base overflow-hidden transition-all duration-500 ${
        !disabled
          ? 'bg-gradient-to-r from-primary to-primary-container text-white shadow-lg shadow-primary-container/20 active:scale-[0.98]'
          : 'bg-surface-container-high text-on-surface-variant/50 cursor-not-allowed'
      } ${isBusy ? 'cursor-wait' : ''} ${className}`}
    >
      <div
        ref={gearRef}
        className={`absolute left-1.5 w-11 h-11 rounded-full flex items-center justify-center ${
          !disabled
            ? 'bg-white/20 text-white'
            : 'bg-surface-container-highest/30 text-on-surface-variant/50'
        }`}
      >
        {isLoading
          ? <Spinner size="md" />
          : <Icon name="settings" size="md" />}
      </div>
      <span className="relative z-10 mx-auto">
        {isLoading ? loadingLabel : label}
      </span>
    </button>
  )
}
