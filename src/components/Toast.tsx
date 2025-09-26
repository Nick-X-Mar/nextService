'use client'

import { useState, useEffect } from 'react'
import { HiCheckCircle, HiXCircle, HiInformationCircle, HiExclamationTriangle, HiXMark } from 'react-icons/hi2'

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

  useEffect(() => {
    // Show toast with animation
    const showTimer = setTimeout(() => setIsVisible(true), 100)
    
    // Auto-hide timer (only if not hovered)
    const hideTimer = setTimeout(() => {
      if (!isHovered) {
        handleClose()
      }
    }, duration)

    return () => {
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
    }
  }, [duration, isHovered])

  const handleClose = () => {
    setIsVisible(false)
    // Wait for animation to complete before removing
    setTimeout(() => onClose(id), 300)
  }

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <HiCheckCircle className="h-5 w-5 text-green-600" />
      case 'error':
        return <HiXCircle className="h-5 w-5 text-red-600" />
      case 'warning':
        return <HiExclamationTriangle className="h-5 w-5 text-yellow-600" />
      case 'info':
      default:
        return <HiInformationCircle className="h-5 w-5 text-blue-600" />
    }
  }

  const getBackgroundColor = () => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200'
      case 'error':
        return 'bg-red-50 border-red-200'
      case 'warning':
        return 'bg-yellow-50 border-yellow-200'
      case 'info':
      default:
        return 'bg-blue-50 border-blue-200'
    }
  }

  return (
    <div
      className={`
        fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50
        w-[50%] max-w-md sm:w-[80%] sm:max-w-sm
        ${getBackgroundColor()}
        border rounded-lg shadow-lg
        transition-all duration-300 ease-in-out
        ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            {getIcon()}
          </div>
          
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-gray-900">
              {title}
            </h4>
            {message && (
              <p className="mt-1 text-sm text-gray-600">
                {message}
              </p>
            )}
          </div>
          
          <button
            onClick={handleClose}
            className="flex-shrink-0 ml-2 p-1 rounded-md hover:bg-gray-100 transition-colors"
          >
            <HiXMark className="h-4 w-4 text-gray-400" />
          </button>
        </div>
      </div>
    </div>
  )
}
