'use client'

import Icon from '@/components/ui/Icon'

interface InlineNudgeProps {
  icon: string
  title: string
  detail: string
  /** Hidden entirely when false, so callers can pass the condition inline. */
  when: boolean
  className?: string
}

/**
 * A quiet, non-dismissable notice about something incomplete in the user's own
 * data — a missing phone number, an empty garage profile.
 *
 * Deliberately not part of the alert stack: those are things other people are
 * waiting on, and mixing "a client wants an answer" with "your profile is 80%
 * done" teaches people to skim past both. This one sits next to the field it is
 * about and disappears the moment the field is filled.
 */
export default function InlineNudge({
  icon,
  title,
  detail,
  when,
  className = '',
}: InlineNudgeProps) {
  if (!when) return null

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 ${className}`}
    >
      <Icon name={icon} size="md" className="text-primary flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm font-bold text-on-surface">{title}</p>
        <p className="text-xs text-on-surface-variant mt-0.5">{detail}</p>
      </div>
    </div>
  )
}
