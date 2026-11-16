'use client'

import { type KeyboardEvent, type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import Icon from '@/components/ui/Icon'

export interface PickerOption {
  key: string
  label: ReactNode
  selected: boolean
  onSelect: () => void
}

interface SearchablePickerProps {
  /** Prefix for the element ids; the field's <label> must carry `${id}-label`. */
  id: string
  /** Wraps trigger and list; the parent closes the list on a click outside it. */
  containerRef: RefObject<HTMLDivElement>
  open: boolean
  /** Opens or closes the list (the parent also closes the other picker and clears the search). */
  onToggle: () => void
  onClose: () => void
  /** What the closed field shows, and whether it is a choice or the placeholder. */
  value: ReactNode
  hasValue: boolean
  search: string
  onSearchChange: (value: string) => void
  searchPlaceholder: string
  options: PickerOption[]
  /** Shown when the search matches nothing, with a way to continue with the typed text. */
  noMatchText: string
  onContinueWithSearch: () => void
}

/**
 * The brand and model fields of the request form: a field that opens a
 * searchable list. Drawn exactly as the divs it replaced, but a real button and
 * listbox, so it works from a keyboard (Tab to it, Enter/Space/↓ to open, ↑/↓
 * to move, Enter to choose, Esc to close) and a screen reader announces it.
 */
export default function SearchablePicker({
  id, containerRef, open, onToggle, onClose, value, hasValue,
  search, onSearchChange, searchPlaceholder, options, noMatchText, onContinueWithSearch,
}: SearchablePickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  // -1 until the keyboard moves it: a mouse or a finger never sees a highlight.
  const [active, setActive] = useState(-1)
  const listId = `${id}-list`
  const optionId = (i: number) => `${id}-option-${i}`
  const showContinue = options.length === 0 && !!search

  // Straight into the search once the list is drawn: a key pressed meanwhile
  // must not land on the button (Enter there would close the list again).
  useEffect(() => {
    if (!open) return
    setActive(-1)
    searchRef.current?.focus()
  }, [open])

  // The list changes as the search narrows it; keep the highlight on a row that exists.
  useEffect(() => { setActive(-1) }, [search])

  const close = (refocus: boolean) => {
    onClose()
    if (refocus) triggerRef.current?.focus()
  }

  const choose = (option: PickerOption) => {
    option.onSelect()
    triggerRef.current?.focus()
  }

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (open) searchRef.current?.focus()
      else onToggle()
    }
  }

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const count = showContinue ? 1 : options.length
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, count - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (showContinue) {
        onContinueWithSearch()
        triggerRef.current?.focus()
      } else if (active >= 0 && options[active]) {
        choose(options[active])
      } else if (options.length === 1) {
        choose(options[0])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close(true)
    } else if (e.key === 'Tab') {
      close(false)
    }
  }

  useEffect(() => {
    if (active < 0) return
    document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' })
    // optionId only depends on id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  const rowClass = (selected: boolean, i: number) =>
    `flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
      selected ? 'bg-primary/10' : `bg-surface-container hover:bg-surface-container-high${active === i ? ' !bg-surface-container-high' : ''}`
    }`

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        id={`${id}-trigger`}
        type="button"
        onClick={onToggle}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={`${id}-label ${id}-value`}
        className="w-full h-14 bg-surface-container-highest rounded-xl px-4 flex items-center justify-between cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span id={`${id}-value`} className={`font-bold text-base ${hasValue ? 'text-on-surface' : 'text-on-surface-variant/50'}`}>
          {value}
        </span>
        <Icon name={open ? 'expand_less' : 'expand_more'} className="text-on-surface-variant" />
      </button>
      {open && (
        <div className="absolute z-50 left-0 right-0 top-[60px] bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/10 max-h-[320px] overflow-y-auto p-2 space-y-1">
          <div className="sticky top-0 bg-surface-container-lowest pb-1">
            <div className="relative">
              <Icon name="search" size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50" />
              <input
                ref={searchRef}
                type="text"
                role="combobox"
                aria-label={searchPlaceholder.replace(/\.+$/, '')}
                aria-expanded={true}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={active >= 0 ? optionId(active) : undefined}
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder={searchPlaceholder}
                className="w-full h-10 bg-surface-container-highest rounded-xl pl-9 pr-4 border-none focus:ring-2 focus:ring-primary text-sm font-medium"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
          {showContinue ? (
            <div className="p-2 space-y-2">
              <p className="text-center text-xs text-on-surface-variant/50">{noMatchText}</p>
              <div id={listId} role="listbox" aria-labelledby={`${id}-label`}>
                <div
                  id={optionId(0)}
                  role="option"
                  aria-selected={false}
                  onClick={() => { onContinueWithSearch(); triggerRef.current?.focus() }}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer bg-tertiary/10 hover:bg-tertiary/20 transition-colors${active === 0 ? ' !bg-tertiary/20' : ''}`}
                >
                  <Icon name="add_circle" size="sm" className="text-tertiary" />
                  <span className="text-sm font-bold text-on-surface">
                    Συνέχεια με &ldquo;<span className="text-tertiary">{search}</span>&rdquo;
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div id={listId} role="listbox" aria-labelledby={`${id}-label`} className="space-y-1">
              {options.map((option, i) => (
                <div
                  key={option.key}
                  id={optionId(i)}
                  role="option"
                  aria-selected={option.selected}
                  onClick={() => choose(option)}
                  className={rowClass(option.selected, i)}
                >
                  <span className={`text-base font-bold ${option.selected ? 'text-primary' : 'text-on-surface'}`}>
                    {option.label}
                  </span>
                  {option.selected && <Icon name="check" size="sm" className="text-primary" />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
