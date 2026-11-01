'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { el } from 'date-fns/locale'
import Icon from '@/components/ui/Icon'
import type { AvailabilitySlots } from '@/utils/availabilitySlots'

interface AvailabilityGridProps {
  /** Selected dates, as 'yyyy-MM-dd'. Columns, in order. */
  dates: string[]
  /** Row labels, as 'HH:00', from the garage's working hours. */
  hours: string[]
  value: AvailabilitySlots
  onChange: (next: AvailabilitySlots) => void
  disabled?: boolean
}

/**
 * Per-date hourly availability, as a date × hour grid.
 *
 * Every hour starts unpicked: the garage taps the hours it can take a car,
 * so nothing reaches the client that the garage did not choose. The expensive
 * case is the repetitive one — "10:00 every day" would be one tap per cell —
 * so the headers are bulk switches:
 *
 *   - the hour label picks that hour on **every** selected date (or clears it
 *     once it is picked everywhere)
 *   - the date header does the same for that whole day
 *   - dragging across cells paints them
 *
 * That turns the common edits into one gesture instead of one per cell.
 */
export default function AvailabilityGrid({
  dates,
  hours,
  value,
  onChange,
  disabled = false,
}: AvailabilityGridProps) {
  // While painting, this is what we're setting cells TO. Fixing it at
  // drag-start is what stops a sweep from flip-flopping cells it crosses.
  const paintTo = useRef<boolean | null>(null)
  const [isPainting, setIsPainting] = useState(false)

  const isAvailable = useCallback(
    (date: string, hour: string) => {
      const forDate = value[date]
      // No entry yet means "untouched", and untouched means nothing picked.
      if (!Array.isArray(forDate)) return false
      return forDate.includes(hour)
    },
    [value]
  )

  const setCells = useCallback(
    (cells: Array<{ date: string; hour: string }>, available: boolean) => {
      if (disabled || cells.length === 0) return
      const next: AvailabilitySlots = { ...value }

      for (const { date, hour } of cells) {
        const current = Array.isArray(next[date]) ? next[date] : []
        const set = new Set(current)
        if (available) set.add(hour)
        else set.delete(hour)
        next[date] = Array.from(set).sort()
      }
      onChange(next)
    },
    [value, onChange, disabled]
  )

  const toggleCell = useCallback(
    (date: string, hour: string) => setCells([{ date, hour }], !isAvailable(date, hour)),
    [setCells, isAvailable]
  )

  /** Whole row: picks the hour on every date, or clears it once it is picked on all. */
  const toggleHourEverywhere = useCallback(
    (hour: string) => {
      const allOpen = dates.every((d) => isAvailable(d, hour))
      setCells(dates.map((date) => ({ date, hour })), !allOpen)
    },
    [dates, isAvailable, setCells]
  )

  /** Whole column. */
  const toggleDay = useCallback(
    (date: string) => {
      const allOpen = hours.every((h) => isAvailable(date, h))
      setCells(hours.map((hour) => ({ date, hour })), !allOpen)
    },
    [hours, isAvailable, setCells]
  )

  // A pointerup anywhere ends the drag — releasing outside the grid otherwise
  // leaves it stuck in painting mode.
  useEffect(() => {
    if (!isPainting) return
    const stop = () => {
      setIsPainting(false)
      paintTo.current = null
    }
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [isPainting])

  const openCount = useMemo(
    () => dates.reduce((sum, d) => sum + hours.filter((h) => isAvailable(d, h)).length, 0),
    [dates, hours, isAvailable]
  )
  const totalCount = dates.length * hours.length

  const dayLabel = (date: string) => {
    const d = new Date(`${date}T00:00:00`)
    return {
      weekday: format(d, 'EEEEEE', { locale: el }),
      day: format(d, 'd/M', { locale: el }),
    }
  }

  if (dates.length === 0 || hours.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl bg-surface-container-low px-4 py-3">
        <Icon name="touch_app" size="sm" className="text-primary mt-0.5 flex-shrink-0" filled />
        <p className="text-xs text-on-surface-variant leading-relaxed">
          Πάτησε τις ώρες που σε <span className="font-bold text-green-700">βολεύουν</span> για να τις
          επιλέξεις. Πάτησε την <span className="font-bold">ώρα</span> αριστερά για να την επιλέξεις σε όλες
          τις μέρες, ή την <span className="font-bold">ημερομηνία</span> πάνω για όλη τη μέρα.
        </p>
      </div>

      {/* touch-none: without it the browser scrolls the page instead of
          delivering the pointermove events the paint gesture needs. */}
      <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
        <table className="border-separate border-spacing-1 select-none">
          <thead>
            <tr>
              {/* Sticky so the hour labels stay put while the dates scroll. */}
              <th className="sticky left-0 z-10 bg-surface-container-lowest" />
              {dates.map((date) => {
                const { weekday, day } = dayLabel(date)
                const dayOpen = hours.every((h) => isAvailable(date, h))
                return (
                  <th key={date} className="p-0">
                    <button
                      type="button"
                      onClick={() => toggleDay(date)}
                      disabled={disabled}
                      title={dayOpen ? 'Καθαρισμός όλης της μέρας' : 'Επιλογή όλης της μέρας'}
                      className={`w-14 rounded-lg px-1 py-1.5 transition-colors disabled:cursor-not-allowed ${
                        dayOpen
                          ? 'bg-green-100 hover:bg-green-200'
                          : 'bg-surface-container-high hover:bg-surface-container-highest'
                      }`}
                    >
                      <span className="block text-[10px] font-black uppercase tracking-wider text-on-surface-variant">
                        {weekday}
                      </span>
                      <span className="block text-[11px] font-bold text-on-surface">{day}</span>
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {hours.map((hour) => {
              const rowOpen = dates.every((d) => isAvailable(d, hour))
              return (
                <tr key={hour}>
                  <th className="sticky left-0 z-10 bg-surface-container-lowest p-0 pr-1">
                    <button
                      type="button"
                      onClick={() => toggleHourEverywhere(hour)}
                      disabled={disabled}
                      title={rowOpen ? 'Καθαρισμός σε όλες τις μέρες' : 'Επιλογή σε όλες τις μέρες'}
                      className={`w-14 rounded-lg py-1.5 text-[11px] font-bold transition-colors disabled:cursor-not-allowed ${
                        rowOpen
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
                      }`}
                    >
                      {hour}
                    </button>
                  </th>

                  {dates.map((date) => {
                    const available = isAvailable(date, hour)
                    return (
                      <td key={`${date}-${hour}`} className="p-0">
                        <button
                          type="button"
                          disabled={disabled}
                          onPointerDown={(e) => {
                            if (disabled) return
                            // Keep the gesture on this element so pointerenter
                            // still fires on the cells we sweep over.
                            e.currentTarget.releasePointerCapture?.(e.pointerId)
                            paintTo.current = !available
                            setIsPainting(true)
                            toggleCell(date, hour)
                          }}
                          onPointerEnter={() => {
                            if (!isPainting || paintTo.current === null) return
                            if (available === paintTo.current) return
                            setCells([{ date, hour }], paintTo.current)
                          }}
                          aria-pressed={available}
                          aria-label={`${date} ${hour} ${available ? 'επιλεγμένη' : 'μη επιλεγμένη'}`}
                          className={`h-9 w-14 touch-none rounded-lg text-xs font-bold transition-colors disabled:cursor-not-allowed ${
                            available
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-surface-container text-on-surface-variant/40 hover:bg-surface-container-high'
                          }`}
                        >
                          {available ? '✓' : '+'}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-secondary">
        {openCount} από {totalCount} ώρες επιλεγμένες
      </p>
    </div>
  )
}
