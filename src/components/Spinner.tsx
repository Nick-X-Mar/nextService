'use client'

import Icon from '@/components/ui/Icon'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

/**
 * The one spinner in the app. Uses the Material Symbols `progress_activity`
 * glyph so it inherits the button's `currentColor` and font size instead of
 * needing its own palette — that's why it reads correctly on primary, outline
 * and danger buttons alike.
 *
 * Inside a button it replaces the leading icon rather than being added next to
 * it, so the label never shifts sideways when an action starts:
 *
 *   {saving ? <Spinner size="sm" /> : <Icon name="save" size="sm" />}
 */
export default function Spinner({ size = 'sm', className = '' }: SpinnerProps) {
  return <Icon name="progress_activity" size={size} className={`animate-spin ${className}`} />
}
