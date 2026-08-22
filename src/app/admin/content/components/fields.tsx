'use client'

import { useState } from 'react'

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface text-sm text-on-surface'
const labelClass = 'block text-sm font-medium text-on-surface/70 mb-1'

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
      {hint && <p className="text-xs text-on-surface/40 mt-1">{hint}</p>}
    </div>
  )
}

export function TextAreaField({
  label,
  value,
  onChange,
  rows = 5,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  rows?: number
  hint?: string
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className={`${inputClass} leading-relaxed`}
      />
      {hint && <p className="text-xs text-on-surface/40 mt-1">{hint}</p>}
    </div>
  )
}

/**
 * A list of short strings — bullets, neighbourhoods, service names.
 *
 * Enter adds, the × removes. Same chip interaction the hot-deals editor uses
 * for a deal's details, so the two admin screens behave the same way.
 */
export function StringListField({
  label,
  items,
  onChange,
  placeholder,
}: {
  label: string
  items: string[]
  onChange: (items: string[]) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')

  const add = () => {
    const value = draft.trim()
    if (!value) return
    onChange([...items, value])
    setDraft('')
  }

  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="space-y-2 mb-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <textarea
              value={item}
              rows={item.length > 90 ? 3 : 1}
              onChange={(e) => {
                const next = [...items]
                next[i] = e.target.value
                onChange(next)
              }}
              className={`${inputClass} flex-1`}
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, index) => index !== i))}
              aria-label={`Αφαίρεση ${i + 1}`}
              className="mt-1 h-8 w-8 shrink-0 rounded-lg bg-surface-container-high text-on-surface/70 hover:bg-surface-container-highest flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder={placeholder || 'Προσθήκη και Enter'}
          className={inputClass}
        />
        <button
          type="button"
          onClick={add}
          className="px-4 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface hover:bg-surface-container-highest transition-colors shrink-0"
        >
          Προσθήκη
        </button>
      </div>
    </div>
  )
}

/** Question/answer pairs, used by both the FAQ blocks and the area editor. */
export function FaqItemsField({
  items,
  onChange,
}: {
  items: { question: string; answer: string }[]
  onChange: (items: { question: string; answer: string }[]) => void
}) {
  const update = (index: number, patch: Partial<{ question: string; answer: string }>) => {
    const next = [...items]
    next[index] = { ...next[index], ...patch }
    onChange(next)
  }

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="rounded-lg border border-outline-variant/20 bg-surface p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface/40">
              Ερώτηση {i + 1}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={i === 0}
                onClick={() => {
                  const next = [...items]
                  ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
                  onChange(next)
                }}
                aria-label="Πάνω"
                className="h-7 w-7 rounded bg-surface-container-high text-on-surface/70 disabled:opacity-30 flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
              </button>
              <button
                type="button"
                disabled={i === items.length - 1}
                onClick={() => {
                  const next = [...items]
                  ;[next[i + 1], next[i]] = [next[i], next[i + 1]]
                  onChange(next)
                }}
                aria-label="Κάτω"
                className="h-7 w-7 rounded bg-surface-container-high text-on-surface/70 disabled:opacity-30 flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
              </button>
              <button
                type="button"
                onClick={() => onChange(items.filter((_, index) => index !== i))}
                aria-label="Διαγραφή ερώτησης"
                className="h-7 w-7 rounded bg-surface-container-high text-tertiary flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
              </button>
            </div>
          </div>
          <input
            type="text"
            value={item.question}
            onChange={(e) => update(i, { question: e.target.value })}
            placeholder="Ερώτηση"
            className={inputClass}
          />
          <textarea
            value={item.answer}
            onChange={(e) => update(i, { answer: e.target.value })}
            rows={3}
            placeholder="Απάντηση"
            className={`${inputClass} leading-relaxed`}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { question: '', answer: '' }])}
        className="px-4 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface hover:bg-surface-container-highest transition-colors"
      >
        + Ερώτηση
      </button>
    </div>
  )
}

export { inputClass, labelClass }
