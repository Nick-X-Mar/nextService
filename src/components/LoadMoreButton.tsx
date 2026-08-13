'use client'

import Icon from '@/components/ui/Icon'

interface LoadMoreButtonProps {
  /** Fired when the user asks for the next page. */
  onClick: () => void
  /** A page request is in flight. */
  loading?: boolean
  /** Hides the control entirely when there is nothing more to fetch. */
  hasMore: boolean
  /** Idle label. Chat threads load backwards, so they override this. */
  label?: string
  loadingLabel?: string
  /** Leading icon — `history` for older messages, `expand_more` for lists. */
  icon?: string
  className?: string
}

/**
 * The single "load the next page" control, shared by every paginated list so
 * chat history, request lists and offer lists all behave and read the same way.
 *
 * Renders nothing when `hasMore` is false, so callers can drop it in
 * unconditionally.
 */
export default function LoadMoreButton({
  onClick,
  loading = false,
  hasMore,
  label = 'Φόρτωση περισσότερων',
  loadingLabel = 'Φόρτωση…',
  icon = 'expand_more',
  className = '',
}: LoadMoreButtonProps) {
  if (!hasMore) return null

  return (
    <div className={`flex justify-center py-3 ${className}`}>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="border border-outline-variant/30 bg-surface-container-lowest text-on-surface hover:bg-surface-container disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-full text-xs font-bold transition-colors duration-200 flex items-center gap-2 active:scale-95"
      >
        <Icon
          name={loading ? 'progress_activity' : icon}
          size="sm"
          className={loading ? 'animate-spin' : ''}
        />
        {loading ? loadingLabel : label}
      </button>
    </div>
  )
}
