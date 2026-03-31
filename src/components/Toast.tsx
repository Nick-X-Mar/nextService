'use client'

import { useState, useEffect, useCallback } from 'react'
import Icon from '@/components/ui/Icon'

export interface ToastProps {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  message?: string
  duration?: number
  onClose: (id: string) => void
}

export default function Toast({
  id,
  type,
  title,
  message,
  duration = 3000,
  onClose
}: ToastProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const handleClose = useCallback(() => {
    setIsVisible(false)
    setTimeout(() => onClose(id), 300)
  }, [onClose, id])

  useEffect(() => {
    const showTimer = setTimeout(() => setIsVisible(true), 100)

    const hideTimer = setTimeout(() => {
      if (!isHovered) {
        handleClose()
      }
    }, duration)

    return () => {
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
    }
  }, [duration, isHovered, onClose, id, handleClose])

  const iconMap = {
    success: { name: 'check_circle', color: 'text-green-600' },
    error: { name: 'cancel', color: 'text-error' },
    warning: { name: 'warning', color: 'text-amber-600' },
    info: { name: 'info', color: 'text-blue-600' },
  }

  const bgMap = {
    success: 'bg-green-50 border-green-200',
    error: 'bg-error-container border-error/20',
    warning: 'bg-amber-50 border-amber-200',
    info: 'bg-blue-50 border-blue-200',
  }

  const { name: iconName, color: iconColor } = iconMap[type]

  return (
    <div
      className={`
        fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[100]
        w-[90%] max-w-md
        ${bgMap[type]}
        border rounded-xl shadow-lg
        transition-all duration-300 ease-in-out
        ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <Icon name={iconName} filled className={iconColor} size="md" />
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-on-surface">
              {title}
            </h4>
            {message && (
              <p className="mt-1 text-sm text-secondary">
                {message}
              </p>
            )}
          </div>

          <button
            onClick={handleClose}
            className="flex-shrink-0 ml-2 p-1 rounded-lg hover:bg-surface-container transition-colors"
          >
            <Icon name="close" size="sm" className="text-secondary" />
          </button>
        </div>
      </div>
    </div>
  )
}
