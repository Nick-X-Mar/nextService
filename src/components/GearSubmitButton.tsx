'use client'

import { useRef } from 'react'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'

interface GearSubmitButtonProps {
  label?: string
  loadingLabel?: string
  disabled?: boolean
  isLoading?: boolean
  onClick: () => void
  className?: string
}

export default function GearSubmitButton({
  label = 'ΣΥΝΕΧΕΙΑ',
  loadingLabel = 'Αποστολη...',
  disabled = false,
  isLoading = false,
  onClick,
  className = '',
}: GearSubmitButtonProps) {
  const gearRef = useRef<HTMLDivElement>(null)

  const isDisabled = disabled || isLoading

  const handleClick = () => {
    if (isDisabled) return
    const gear = gearRef.current
    if (gear) {
      gear.classList.remove('animate-gear-roll')
      void gear.offsetWidth
      gear.classList.add('animate-gear-roll')
    }
    setTimeout(onClick, 600)
  }

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      className={`relative w-full h-14 rounded-full flex items-center font-bold text-base overflow-hidden transition-all duration-500 ${
        !isDisabled
          ? 'bg-gradient-to-r from-primary to-primary-container text-white shadow-lg shadow-primary-container/20 active:scale-[0.98]'
          : 'bg-surface-container-high text-on-surface-variant/50 cursor-not-allowed'
      } ${className}`}
    >
      <div
        ref={gearRef}
        className={`absolute left-1.5 w-11 h-11 rounded-full flex items-center justify-center ${
          !isDisabled
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
