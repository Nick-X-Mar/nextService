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
 * Every hour starts available, so a garage that works its normal day touches
 * nothing. The expensive case is the repetitive one — "closed 14:00–15:00
 * every day" would be one tap per cell — so the headers are bulk switches:
 *
 *   - the hour label toggles that hour across **every** selected date
 *   - the date header toggles that whole day
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
      // No entry yet means "untouched", and untouched means available.
      if (!Array.isArray(forDate)) return true
      return forDate.includes(hour)
    },
    [value]
  )

  const setCells = useCallback(
    (cells: Array<{ date: string; hour: string }>, available: boolean) => {
      if (disabled || cells.length === 0) return
      const next: AvailabilitySlots = { ...value }

      for (const { date, hour } of cells) {
        const current = Array.isArray(next[date]) ? next[date] : [...hours]
        const set = new Set(current)
        if (available) set.add(hour)
        else set.delete(hour)
        next[date] = Array.from(set).sort()
      }
      onChange(next)
    },
    [value, hours, onChange, disabled]
  )

  const toggleCell = useCallback(
    (date: string, hour: string) => setCells([{ date, hour }], !isAvailable(date, hour)),
    [setCells, isAvailable]
  )

  /** Whole row: if any date still has this hour open, close them all. */
  const toggleHourEverywhere = useCallback(
    (hour: string) => {
      const anyOpen = dates.some((d) => isAvailable(d, hour))
      setCells(dates.map((date) => ({ date, hour })), !anyOpen)
    },
    [dates, isAvailable, setCells]
  )

  /** Whole column. */
  const toggleDay = useCallback(
    (date: string) => {
      const anyOpen = hours.some((h) => isAvailable(date, h))
      setCells(hours.map((hour) => ({ date, hour })), !anyOpen)
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
          Όλες οι ώρες είναι <span className="font-bold text-green-700">διαθέσιμες</span>. Πάτησε
          όποια δεν σε βολεύει για να την κλείσεις. Πάτησε την <span className="font-bold">ώρα</span> αριστερά
          για να την κλείσεις σε όλες τις μέρες, ή την <span className="font-bold">ημερομηνία</span> πάνω
          για όλη τη μέρα.
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
                const dayOpen = hours.some((h) => isAvailable(date, h))
                return (
                  <th key={date} className="p-0">
                    <button
                      type="button"
                      onClick={() => toggleDay(date)}
                      disabled={disabled}
                      title={dayOpen ? 'Κλείσιμο όλης της μέρας' : 'Άνοιγμα όλης της μέρας'}
                      className={`w-14 rounded-lg px-1 py-1.5 transition-colors disabled:cursor-not-allowed ${
                        dayOpen
                          ? 'bg-surface-container-high hover:bg-surface-container-highest'
                          : 'bg-red-50 hover:bg-red-100'
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
              const rowOpen = dates.some((d) => isAvailable(d, hour))
              return (
                <tr key={hour}>
                  <th className="sticky left-0 z-10 bg-surface-container-lowest p-0 pr-1">
                    <button
                      type="button"
                      onClick={() => toggleHourEverywhere(hour)}
                      disabled={disabled}
                      title={rowOpen ? 'Κλείσιμο σε όλες τις μέρες' : 'Άνοιγμα σε όλες τις μέρες'}
                      className={`w-14 rounded-lg py-1.5 text-[11px] font-bold transition-colors disabled:cursor-not-allowed ${
                        rowOpen
                          ? 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
                          : 'bg-red-50 text-red-700 hover:bg-red-100'
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
                          aria-label={`${date} ${hour} ${available ? 'διαθέσιμο' : 'μη διαθέσιμο'}`}
                          className={`h-9 w-14 touch-none rounded-lg text-xs font-bold transition-colors disabled:cursor-not-allowed ${
                            available
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-red-100 text-red-400 hover:bg-red-200'
                          }`}
                        >
                          {available ? '✓' : '✕'}
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
        {openCount} από {totalCount} ώρες διαθέσιμες
      </p>
    </div>
  )
}
