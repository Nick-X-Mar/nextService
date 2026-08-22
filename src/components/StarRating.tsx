'use client'

import { useState } from 'react'

/**
 * Five stars, either as an input or as a read-only score.
 *
 * Interactive mode is a real radio group rather than a row of buttons, so it
 * is reachable by keyboard and announced as "3 από 5" instead of as five
 * unrelated controls.
 */
export default function StarRating({
  value,
  onChange,
  size = 'md',
  label,
}: {
  value: number
  onChange?: (value: number) => void
  size?: 'sm' | 'md' | 'lg'
  label?: string
}) {
  const [hovered, setHovered] = useState(0)
  const readOnly = !onChange
  const shown = hovered || value

  const glyph = size === 'sm' ? 'text-[18px]' : size === 'lg' ? 'text-[34px]' : 'text-[26px]'

  if (readOnly) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-primary-container"
        role="img"
        aria-label={`${value} από 5`}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            aria-hidden="true"
            className={`material-symbols-outlined ${glyph} ${
              star <= value ? 'text-primary-container' : 'text-outline-variant/50'
            }`}
            style={star <= value ? { fontVariationSettings: "'FILL' 1" } : undefined}
          >
            star
          </span>
        ))}
      </span>
    )
  }

  return (
    <div
      role="radiogroup"
      aria-label={label || 'Βαθμολογία'}
      className="inline-flex items-center gap-1"
      onMouseLeave={() => setHovered(0)}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} ${star === 1 ? 'αστέρι' : 'αστέρια'}`}
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onFocus={() => setHovered(star)}
          onBlur={() => setHovered(0)}
          className="p-0.5 rounded transition-transform active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span
            className={`material-symbols-outlined ${glyph} ${
              star <= shown ? 'text-primary-container' : 'text-outline-variant/60'
            }`}
            style={star <= shown ? { fontVariationSettings: "'FILL' 1" } : undefined}
          >
            star
          </span>
        </button>
      ))}
    </div>
  )
}

/** Compact "4.6 (12)" summary for lists and profile headers. */
export function RatingSummary({
  average,
  count,
  className = '',
}: {
  average: number | null
  count: number
  className?: string
}) {
  if (average === null || count === 0) {
    return <span className={`text-xs text-on-surface-variant ${className}`}>Χωρίς αξιολογήσεις</span>
  }
  return (
    <span className={`inline-flex items-center gap-1 text-xs text-on-surface ${className}`}>
      <span
        aria-hidden="true"
        className="material-symbols-outlined text-[16px] text-primary-container"
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        star
      </span>
      <span className="font-bold">{average.toFixed(1)}</span>
      <span className="text-on-surface-variant">({count})</span>
    </span>
  )
}
