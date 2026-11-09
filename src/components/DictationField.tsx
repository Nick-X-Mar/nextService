'use client'

import { useLayoutEffect, useRef, type ReactNode, type TextareaHTMLAttributes } from 'react'
import Icon from '@/components/ui/Icon'
import { useSpeechInput, type SpeechFailure } from '@/hooks/useSpeechInput'
import { useToast } from '@/hooks/useToast'

const SPEECH_FAILURES: Record<SpeechFailure, [string, string]> = {
  denied: ['Δεν δόθηκε πρόσβαση στο μικρόφωνο', 'Επίτρεψέ την από τις ρυθμίσεις του browser ή γράψε το κείμενο.'],
  'no-speech': ['Δεν ακούστηκε κάτι', 'Δοκίμασε ξανά ή γράψε το κείμενο.'],
  unavailable: ['Το μικρόφωνο δεν είναι διαθέσιμο εδώ', 'Γράψε το κείμενο στο πεδίο.'],
}

/** Lines the field grows to before it scrolls instead. */
const MAX_ROWS = 6

const VARIANTS = {
  // The homepage search: a bar inside its own card.
  bar: {
    box: 'min-h-[60px] pl-4 pr-2',
    field: 'py-[18px] font-bold placeholder:font-normal placeholder:text-on-surface-variant/70',
    mic: 'mb-2.5',
  },
  // A form field, filled like the app's inputs.
  field: {
    box: 'pl-4 pr-1.5 bg-surface-container-highest rounded-xl focus-within:ring-2 focus-within:ring-primary',
    field: 'py-3 font-medium',
    mic: 'mb-1',
  },
} as const

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'className' | 'aria-label'>

interface DictationFieldProps extends TextareaProps {
  value: string
  /** `source` says whether the text came from the keyboard or the microphone. */
  onChange: (value: string, source: 'typed' | 'voice') => void
  label: string
  variant?: keyof typeof VARIANTS
  className?: string
  leading?: ReactNode
  /** After the microphone, e.g. a send button that waits while it listens. */
  trailing?: (state: { listening: boolean }) => ReactNode
}

/**
 * A text field that also takes Greek dictation — the homepage search and the
 * request's description are this one field.
 *
 * Dictation adds to what is already there, typed or spoken, and stops at the
 * first pause (see useSpeechInput), so the microphone stays on offer to go on.
 * The field grows with the text up to MAX_ROWS lines and scrolls after that,
 * following the words as they are spoken. Where the browser has no speech
 * recognition there is no microphone, just the field.
 */
export default function DictationField({
  value,
  onChange,
  label,
  variant = 'field',
  className = '',
  leading,
  trailing,
  placeholder,
  readOnly,
  rows = 1,
  ...textareaProps
}: DictationFieldProps) {
  const { error } = useToast()
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const styles = VARIANTS[variant]

  // What the field held when the microphone started.
  const spokenPrefixRef = useRef('')
  // Spoken text is followed to its end; typing keeps the caret where it is.
  const followRef = useRef(false)
  const speech = useSpeechInput({
    onText: (spoken) => {
      followRef.current = true
      onChange(spokenPrefixRef.current ? `${spokenPrefixRef.current} ${spoken}` : spoken, 'voice')
    },
    onFailure: (failure) => error(...SPEECH_FAILURES[failure]),
  })
  const toggleSpeech = () => {
    if (!speech.listening) spokenPrefixRef.current = value.trim()
    speech.toggle()
  }

  useLayoutEffect(() => {
    const fit = () => {
      const field = fieldRef.current
      if (!field) return
      const style = getComputedStyle(field)
      const maxHeight = parseFloat(style.lineHeight) * MAX_ROWS + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
      field.style.height = 'auto'
      const height = Math.min(field.scrollHeight, maxHeight)
      field.style.height = `${height}px`
      field.style.overflowY = field.scrollHeight > height ? 'auto' : 'hidden'
    }
    fit()
    if (followRef.current && fieldRef.current) fieldRef.current.scrollTop = fieldRef.current.scrollHeight
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [value])

  return (
    <div className={`flex items-end gap-1 ${styles.box} ${className}`}>
      {leading}
      <textarea
        {...textareaProps}
        ref={fieldRef}
        rows={rows}
        value={value}
        onChange={(e) => {
          followRef.current = false
          onChange(e.target.value, 'typed')
        }}
        readOnly={readOnly}
        aria-label={label}
        placeholder={speech.listening ? 'Σε ακούω...' : placeholder}
        className={`flex-1 min-w-0 px-0 resize-none overflow-hidden bg-transparent border-none outline-none focus:ring-0 text-sm leading-6 text-on-surface ${styles.field}`}
      />
      {speech.supported && (
        <button
          type="button"
          onClick={toggleSpeech}
          disabled={readOnly}
          aria-label={
            speech.listening ? 'Σταμάτα την ηχογράφηση'
              : value.trim() ? 'Συνέχισε με τη φωνή σου'
                : 'Πες το με τη φωνή σου'
          }
          aria-pressed={speech.listening}
          className={`w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center active:scale-95 transition-colors ${styles.mic} ${
            speech.listening
              ? 'machined-gradient text-on-primary animate-pulse'
              : 'text-primary hover:bg-surface-container-high'
          }`}
        >
          <Icon name="mic" size="md" filled={speech.listening} />
        </button>
      )}
      {trailing?.({ listening: speech.listening })}
    </div>
  )
}
