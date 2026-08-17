'use client'

import type { ReactNode } from 'react'
import Icon from '@/components/ui/Icon'

/**
 * The app's one expand/collapse card.
 *
 * The rule, everywhere: a click anywhere on the card **opens** it, the arrow on the
 * right **closes** it, and opening another card closes this one (the parent holds a
 * single open id). A card that also collapsed on any click kept shutting itself while
 * the user was reading — mid-sentence, mid-tap on a date, mid-reach for a button.
 */
interface ExpandableCardProps {
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
  /** Always-visible part; the click target that opens the card. */
  header: ReactNode
  children: ReactNode
  /** `glass` is the landing page's dark panel; `surface` is the in-app card. */
  tone?: 'surface' | 'glass'
  className?: string
  /** Extra classes for the body wrapper (padding differs per usage). */
  bodyClassName?: string
  /** Named for screen readers, e.g. the question or the shop's name. */
  label?: string
  /**
   * Keep the body in the DOM while collapsed, hidden with CSS. The FAQ pages need
   * this: their answers are the indexable content, and a body that only renders on
   * click is a body no crawler ever sees. In-app cards leave it off so heavy
   * children (calendars, forms) mount only when opened.
   */
  keepMounted?: boolean
}

export default function ExpandableCard({
  isOpen,
  onOpen,
  onClose,
  header,
  children,
  tone = 'surface',
  className = '',
  bodyClassName = '',
  label,
  keepMounted = false,
}: ExpandableCardProps) {
  const toneClasses = tone === 'glass'
    ? `bg-black/40 backdrop-blur-md border ${isOpen ? 'border-white/25' : 'border-white/10'}`
    : `border ${isOpen
        ? 'border-primary/30 bg-surface-container-lowest shadow-md'
        : 'border-outline-variant/10 bg-surface-container hover:border-primary/20'}`

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={isOpen}
      aria-label={label}
      onClick={() => { if (!isOpen) onOpen() }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          if (isOpen) onClose()
          else onOpen()
        }
      }}
      className={`rounded-2xl overflow-hidden transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${toneClasses} ${className}`}
    >
      <div className="flex items-start justify-between gap-3 px-5 py-4">
        <div className="min-w-0 flex-1">{header}</div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            if (isOpen) onClose()
            else onOpen()
          }}
          aria-label={isOpen ? 'Κλείσιμο' : 'Άνοιγμα'}
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors active:scale-95 ${
            tone === 'glass'
              ? 'text-white/70 hover:bg-white/10 hover:text-white'
              : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
          }`}
        >
          <Icon name={isOpen ? 'expand_less' : 'expand_more'} size="md" />
        </button>
      </div>

      {(isOpen || keepMounted) && (
        <div hidden={!isOpen} className={`px-5 pb-5 ${bodyClassName}`}>
          {children}
        </div>
      )}
    </div>
  )
}
