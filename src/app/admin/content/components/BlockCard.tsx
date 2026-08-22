'use client'

import type { ContentBlock, ContentBlockType } from '@/types/siteContent'
import { FaqItemsField, StringListField, TextAreaField, TextField, inputClass, labelClass } from './fields'

const MARKUP_HINT = '**έντονα**, *πλάγια*, [κείμενο](https://…). Κενή γραμμή = νέα παράγραφος.'

const TYPE_LABELS: Record<ContentBlockType, string> = {
  heading: 'Τίτλος ενότητας',
  paragraph: 'Παράγραφος',
  list: 'Λίστα',
  faq: 'Ερωτήσεις',
  cards: 'Κάρτες',
  callout: 'Σημείωση',
  cta: 'Κουμπί',
  areas: 'Λίστα περιοχών',
}

export function blockLabel(type: ContentBlockType): string {
  return TYPE_LABELS[type]
}

export default function BlockCard({
  block,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  block: ContentBlock
  index: number
  total: number
  onChange: (block: ContentBlock) => void
  onMove: (from: number, to: number) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-primary">
            {TYPE_LABELS[block.type]}
          </span>
          <span className="text-[10px] text-on-surface/30">{block.id}</span>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onMove(index, index - 1)}
            aria-label="Μετακίνηση πάνω"
            className="h-7 w-7 rounded bg-surface-container-high text-on-surface/70 disabled:opacity-30 flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={() => onMove(index, index + 1)}
            aria-label="Μετακίνηση κάτω"
            className="h-7 w-7 rounded bg-surface-container-high text-on-surface/70 disabled:opacity-30 flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Διαγραφή μπλοκ"
            className="h-7 w-7 rounded bg-surface-container-high text-tertiary flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
          </button>
        </div>
      </div>

      {block.type === 'heading' && (
        <TextField label="Κείμενο" value={block.text} onChange={(text) => onChange({ ...block, text })} />
      )}

      {block.type === 'paragraph' && (
        <TextAreaField
          label="Κείμενο"
          value={block.text}
          onChange={(text) => onChange({ ...block, text })}
          rows={6}
          hint={MARKUP_HINT}
        />
      )}

      {block.type === 'list' && (
        <StringListField
          label="Στοιχεία"
          items={block.items}
          onChange={(items) => onChange({ ...block, items })}
        />
      )}

      {block.type === 'callout' && (
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Τόνος</label>
            <select
              value={block.tone}
              onChange={(e) => onChange({ ...block, tone: e.target.value as 'info' | 'warning' })}
              className={inputClass}
            >
              <option value="info">Πληροφορία (μπλε)</option>
              <option value="warning">Προσοχή (κίτρινο)</option>
            </select>
          </div>
          <TextAreaField
            label="Κείμενο"
            value={block.text}
            onChange={(text) => onChange({ ...block, text })}
            rows={3}
            hint={MARKUP_HINT}
          />
        </div>
      )}

      {block.type === 'cta' && (
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField label="Κείμενο" value={block.label} onChange={(label) => onChange({ ...block, label })} />
          <TextField
            label="Σύνδεσμος"
            value={block.href}
            onChange={(href) => onChange({ ...block, href })}
            hint="/car-details/ ή https://…"
          />
          <div>
            <label className={labelClass}>Στυλ</label>
            <select
              value={block.variant}
              onChange={(e) => onChange({ ...block, variant: e.target.value as 'primary' | 'secondary' })}
              className={inputClass}
            >
              <option value="primary">Κύριο</option>
              <option value="secondary">Δευτερεύον</option>
            </select>
          </div>
        </div>
      )}

      {block.type === 'faq' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Τίτλος ομάδας (προαιρετικό)"
              value={block.title || ''}
              onChange={(title) => onChange({ ...block, title })}
            />
            <TextField
              label="Εικονίδιο"
              value={block.icon || ''}
              onChange={(icon) => onChange({ ...block, icon })}
              hint="Material Symbols, π.χ. help"
            />
          </div>
          <FaqItemsField items={block.items} onChange={(items) => onChange({ ...block, items })} />
        </div>
      )}

      {block.type === 'cards' && (
        <div className="space-y-3">
          {block.items.map((item, i) => (
            <div key={i} className="rounded-lg border border-outline-variant/20 bg-surface p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface/40">
                  Κάρτα {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onChange({ ...block, items: block.items.filter((_, index) => index !== i) })
                  }
                  aria-label="Διαγραφή κάρτας"
                  className="h-7 w-7 rounded bg-surface-container-high text-tertiary flex items-center justify-center"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  value={item.icon}
                  onChange={(e) => {
                    const items = [...block.items]
                    items[i] = { ...items[i], icon: e.target.value }
                    onChange({ ...block, items })
                  }}
                  placeholder="Εικονίδιο (π.χ. build)"
                  className={inputClass}
                />
                <input
                  type="text"
                  value={item.title}
                  onChange={(e) => {
                    const items = [...block.items]
                    items[i] = { ...items[i], title: e.target.value }
                    onChange({ ...block, items })
                  }}
                  placeholder="Τίτλος"
                  className={inputClass}
                />
              </div>
              <textarea
                value={item.body}
                onChange={(e) => {
                  const items = [...block.items]
                  items[i] = { ...items[i], body: e.target.value }
                  onChange({ ...block, items })
                }}
                rows={3}
                placeholder="Κείμενο"
                className={`${inputClass} leading-relaxed`}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({ ...block, items: [...block.items, { icon: 'build', title: '', body: '' }] })
            }
            className="px-4 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface hover:bg-surface-container-highest transition-colors"
          >
            + Κάρτα
          </button>
        </div>
      )}

      {block.type === 'areas' && (
        <p className="text-sm text-on-surface/50">
          Εδώ εμφανίζεται αυτόματα η λίστα των περιοχών. Το περιεχόμενο κάθε περιοχής το
          αλλάζεις από την ενότητα «Περιοχές».
        </p>
      )}
    </div>
  )
}
