'use client'

import React, { useState, useLayoutEffect, useRef, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { gsap } from 'gsap'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import { useNavigation } from '@/hooks/useNavigation'
import { startNewRequest } from '@/utils/formStorage'
import { SERVICE_CATEGORIES as categories, OTHER_CATEGORY } from '@/utils/categoryLabels'
import { track } from '@/lib/track'
import { useSpeechInput, type SpeechFailure } from '@/hooks/useSpeechInput'
import { useToast } from '@/hooks/useToast'

/** Long enough for the page to settle, so the opening is seen rather than missed. */
const AUTO_OPEN_DELAY_MS = 800

const SPEECH_FAILURES: Record<SpeechFailure, [string, string]> = {
  denied: ['Δεν δόθηκε πρόσβαση στο μικρόφωνο', 'Επίτρεψέ την από τις ρυθμίσεις του browser ή γράψε το κείμενο.'],
  'no-speech': ['Δεν ακούστηκε κάτι', 'Δοκίμασε ξανά ή γράψε το κείμενο.'],
  unavailable: ['Το μικρόφωνο δεν είναι διαθέσιμο εδώ', 'Γράψε το κείμενο στο πεδίο.'],
}

/**
 * Opens the category menu on `/?open=1` — where the "Νέο Αίτημα" buttons send
 * you, even from the homepage itself, so it has to react to the URL changing.
 *
 * Its own component behind its own Suspense: on a static page useSearchParams
 * renders nothing on the server up to the nearest boundary. With the hook in
 * HeroSection that was the whole hero — the page's only h1 and the category
 * list — so crawlers got an empty `min-h-screen` div. Now only this, which
 * renders nothing anyway, waits for the browser.
 */
function OpenOnParam({ onOpen }: { onOpen: () => void }) {
  const searchParams = useSearchParams()
  useEffect(() => {
    if (searchParams.get('open') === '1') onOpen()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])
  return null
}

export default function HeroSection() {
  const { navigate } = useNavigation()
  const { error } = useToast()
  const [selectedCategory, setSelectedCategory] = useState('')
  const [text, setText] = useState('')
  // Whether the text in the field came from the microphone, for the funnel.
  const spokenRef = useRef(false)
  // The category tap fires a 500ms close animation before the push, so without
  // this the row sits there looking inert for the whole wait.
  const [pendingCategory, setPendingCategory] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const itemsRef = useRef<HTMLDivElement[]>([])
  const tlRef = useRef<gsap.core.Timeline | null>(null)
  // Read by OpenOnParam's callback, which can fire without this component
  // re-rendering, so a captured `isOpen` could be stale.
  const isOpenRef = useRef(false)
  useEffect(() => { isOpenRef.current = isOpen }, [isOpen])

  const selectedLabel = categories.find(c => c.value === selectedCategory)?.label || ''

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set(itemsRef.current, { y: 30, opacity: 0 })
      const tl = gsap.timeline({ paused: true })
      // The list, not the box: the bar has to keep its height for a long text.
      tl.to(listRef.current, { height: 'auto', duration: 0.4, ease: 'power3.out' })
        .to(itemsRef.current, { y: 0, opacity: 1, duration: 0.3, ease: 'power3.out', stagger: 0.06 }, '-=0.2')
      tlRef.current = tl
    }, containerRef)
    return () => ctx.revert()
  }, [])

  const openMenu = () => {
    if (!tlRef.current || isOpenRef.current) return
    isOpenRef.current = true
    tlRef.current.play()
    setIsOpen(true)
  }

  // Auto-open when navigated with ?open=1
  const openFromParam = () => {
    setTimeout(openMenu, 300)
  }

  // Opens by itself so it is clear the list is there to pick from. The field is
  // not focused: on a phone that would raise the keyboard over the list.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (window.scrollY > 0) return
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) tlRef.current?.progress(1)
      openMenu()
    }, AUTO_OPEN_DELAY_MS)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleMenu = () => {
    if (!tlRef.current) return
    if (isOpen) {
      isOpenRef.current = false
      tlRef.current.reverse()
      setIsOpen(false)
    } else {
      openMenu()
    }
  }

  const speech = useSpeechInput({
    onText: (spoken) => {
      spokenRef.current = true
      setText(spoken)
    },
    onFailure: (failure) => error(...SPEECH_FAILURES[failure]),
  })

  // The whole text stays readable, typed or dictated, so the field follows it.
  const fieldValue = selectedCategory ? selectedLabel : text
  useLayoutEffect(() => {
    const fit = () => {
      const field = fieldRef.current
      if (!field) return
      field.style.height = 'auto'
      field.style.height = `${field.scrollHeight}px`
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [fieldValue])

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const selectCategory = (value: string) => {
    if (pendingCategory) return
    setSelectedCategory(value)
    setPendingCategory(value)
    isOpenRef.current = false
    if (tlRef.current) tlRef.current.reverse()
    setIsOpen(false)
    const description = text.trim()
    startNewRequest({ category: value, ...(description ? { description } : {}) })
    track('category_selected', { category: value })
    setTimeout(() => {
      navigate('/car-details/')
    }, 500)
  }

  const submitText = (event: React.SyntheticEvent) => {
    event.preventDefault()
    const description = text.trim()
    if (!description || pendingCategory) return
    setPendingCategory(OTHER_CATEGORY)
    startNewRequest({ category: OTHER_CATEGORY, description })
    // The source, never the text: it can name people and cars.
    track('category_selected', { category: OTHER_CATEGORY, source: spokenRef.current ? 'voice' : 'typed' })
    navigate('/car-details/')
  }

  return (
    <section className="relative min-h-screen flex flex-col">
      {/* Overlay removed — now applied globally in LandingPage */}

      <Suspense fallback={null}>
        <OpenOnParam onOpen={openFromParam} />
      </Suspense>

      <h1 className="sr-only">
        NextService — Βρες συνεργείο αυτοκινήτου στην Ελλάδα και πάρε προσφορές από επαγγελματίες για service, συμπλέκτη, ιμάντα χρονισμού και φανοποιεία
      </h1>

      {/* Content */}
      <div className="relative z-10 flex-1 px-5 pt-20 pb-6 flex flex-col items-center justify-center">
        {/* Animated Command Menu */}
        <div
          ref={containerRef}
          className="w-full max-w-[480px] bg-surface-container-lowest/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-outline-variant/10 overflow-hidden"
        >
          {/* Search Bar */}
          <form onSubmit={submitText} className="min-h-[60px] flex items-end gap-1 pl-4 pr-2">
            <Icon name="search" size="md" className="mr-2 mb-5 flex-shrink-0 text-on-surface-variant/50" />
            <textarea
              ref={fieldRef}
              rows={1}
              value={fieldValue}
              onChange={(e) => {
                spokenRef.current = false
                setText(e.target.value)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submitText(e)
              }}
              onFocus={openMenu}
              readOnly={!!pendingCategory}
              maxLength={2000}
              enterKeyHint="go"
              autoComplete="off"
              aria-label="Τι χρειάζεται το αυτοκίνητό σου;"
              placeholder={speech.listening ? 'Σε ακούω...' : 'Γράψε τι χρειάζεσαι'}
              className="flex-1 min-w-0 py-[18px] px-0 resize-none overflow-hidden bg-transparent border-none outline-none focus:ring-0 text-sm leading-6 font-bold text-on-surface placeholder:font-normal placeholder:text-on-surface-variant/70"
            />
            {text.trim() && !speech.listening ? (
              <button
                type="submit"
                aria-label="Συνέχεια"
                className="w-10 h-10 mb-2.5 flex-shrink-0 rounded-full machined-gradient text-on-primary flex items-center justify-center active:scale-95 transition-transform"
              >
                {pendingCategory === OTHER_CATEGORY ? <Spinner size="sm" /> : <Icon name="arrow_forward" size="sm" />}
              </button>
            ) : speech.supported && (
              <button
                type="button"
                onClick={speech.toggle}
                aria-label={speech.listening ? 'Σταμάτα την ηχογράφηση' : 'Πες το με τη φωνή σου'}
                aria-pressed={speech.listening}
                className={`w-10 h-10 mb-2.5 flex-shrink-0 rounded-full flex items-center justify-center active:scale-95 transition-colors ${
                  speech.listening
                    ? 'machined-gradient text-on-primary animate-pulse'
                    : 'text-primary hover:bg-surface-container-high'
                }`}
              >
                <Icon name="mic" size="md" filled={speech.listening} />
              </button>
            )}
            <button
              type="button"
              onClick={toggleMenu}
              aria-label={isOpen ? 'Κλείσιμο επιλογών' : 'Άνοιγμα επιλογών'}
              aria-expanded={isOpen}
              className="w-9 h-10 mb-2.5 flex-shrink-0 rounded-lg text-on-surface-variant flex items-center justify-center hover:bg-surface-container-high active:scale-95 transition-colors"
            >
              <Icon name={isOpen ? 'expand_less' : 'expand_more'} size="md" />
            </button>
          </form>

          {/* Dropdown Items */}
          <div ref={listRef} className="h-0 overflow-hidden">
            <div className="p-2 pt-0 space-y-1">
              {categories.map((cat, i) => (
                <div
                  key={cat.value}
                  ref={el => { itemsRef.current[i] = el! }}
                  onClick={() => selectCategory(cat.value)}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                    selectedCategory === cat.value
                      ? 'bg-primary/10'
                      : 'bg-surface-container hover:bg-surface-container-high'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      name={cat.icon}
                      size="sm"
                      className={selectedCategory === cat.value ? 'text-primary' : 'text-on-surface-variant/60'}
                    />
                    <span className={`text-sm font-bold ${
                      selectedCategory === cat.value ? 'text-primary' : 'text-on-surface'
                    }`}>
                      {cat.label}
                    </span>
                  </div>
                  {pendingCategory === cat.value ? (
                    <Spinner size="sm" className="text-primary" />
                  ) : (
                    <Icon
                      name="arrow_forward"
                      size="sm"
                      className={selectedCategory === cat.value ? 'text-primary' : 'text-on-surface-variant/30'}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Scroll cue — the only signal that the completed-jobs carousel and the FAQ
          exist below the fold. In the flow under the menu, since the menu now opens
          by itself: on a short screen the hero grows rather than the two colliding.
          The padding keeps it above BottomNav on mobile. */}
      <div className="relative z-10 pb-28 md:pb-16 flex flex-col items-center gap-2">
        <div className="flex flex-wrap items-center justify-center gap-2 px-4">
          <button
            type="button"
            onClick={() => scrollTo('offers')}
            className="flex items-center gap-1.5 md:gap-2 rounded-full bg-black/45 hover:bg-black/60 backdrop-blur-md border border-white/25 px-3 md:px-4 py-2.5 shadow-lg active:scale-95 transition-all"
          >
            <Icon name="receipt_long" size="sm" className="text-primary-container" />
            <span className="text-xs md:text-sm font-bold text-white whitespace-nowrap">
              Ολοκληρωμένες εργασίες
            </span>
          </button>
          <button
            type="button"
            onClick={() => scrollTo('faq')}
            className="flex items-center gap-1.5 md:gap-2 rounded-full bg-black/45 hover:bg-black/60 backdrop-blur-md border border-white/25 px-3 md:px-4 py-2.5 shadow-lg active:scale-95 transition-all"
          >
            <Icon name="help" size="sm" className="text-primary-container" />
            <span className="text-xs md:text-sm font-bold text-white whitespace-nowrap">
              {/* The full label doesn't fit beside the offers pill on a phone row */}
              <span className="md:hidden">Ερωτήσεις</span>
              <span className="hidden md:inline">Συχνές ερωτήσεις</span>
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={() => scrollTo('offers')}
          aria-label="Δες τι υπάρχει πιο κάτω"
          className="w-20 h-10 rounded-full machined-gradient shadow-lg shadow-primary/30 flex items-center justify-center active:scale-95 transition-transform"
        >
          {/* The chevron bounces, not the button — a moving hit area makes the
              tap easy to miss on a phone. */}
          <Icon name="keyboard_arrow_down" size="lg" className="text-on-primary animate-bounce" />
        </button>
      </div>
    </section>
  )
}
