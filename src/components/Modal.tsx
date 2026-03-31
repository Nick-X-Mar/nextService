'use client'

import { useEffect } from 'react'
import Icon from '@/components/ui/Icon'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showCloseButton?: boolean
  closeOnEscape?: boolean
  closeOnBackdropClick?: boolean
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'lg',
  showCloseButton = true,
  closeOnEscape = true,
  closeOnBackdropClick = false
}: ModalProps) {
  useEffect(() => {
    if (!closeOnEscape) return

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey)
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey)
    }
  }, [isOpen, onClose, closeOnEscape])

  const handleBackdropClick = (event: React.MouseEvent) => {
    if (closeOnBackdropClick && event.target === event.currentTarget) {
      onClose()
    }
  }

  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 z-50 bg-on-surface/20 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className={`bg-surface-container-lowest rounded-2xl shadow-2xl ${sizeClasses[size]} w-full max-h-[90vh] overflow-y-auto border border-outline-variant/10`}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-outline-variant/10">
          <h2 className="text-xl font-bold text-on-surface tracking-tight">
            {title}
          </h2>
          {showCloseButton && (
            <button
              onClick={onClose}
              className="p-2 rounded-full text-secondary hover:text-on-surface hover:bg-surface-container transition-colors"
            >
              <Icon name="close" size="md" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex justify-end gap-3 p-6 border-t border-outline-variant/10">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
