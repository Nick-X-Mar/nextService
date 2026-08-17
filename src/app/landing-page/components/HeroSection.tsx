'use client'

import React, { useState, useLayoutEffect, useRef, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { gsap } from 'gsap'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import { useNavigation } from '@/hooks/useNavigation'
import { saveFormData } from '@/utils/formStorage'

const categories = [
  { icon: 'settings', label: 'Συμπλέκτης (Δίσκος-πλατό)', value: 'symplektis' },
  { icon: 'conveyor_belt', label: 'Ιμάντας', value: 'imantas' },
  { icon: 'format_paint', label: 'Ολική Βαφή', value: 'oliki-vafi' },
  { icon: 'brush', label: 'Μερική Βαφή', value: 'meriki-vafi' },
  { icon: 'sensors', label: 'Αισθητήρες', value: 'aisthitires' },
  { icon: 'oil_barrel', label: 'Αλλαγή λαδιών', value: 'allagi-ladion' },
]

export default function HeroSection() {
  const { navigate } = useNavigation()
  const searchParams = useSearchParams()
  const [selectedCategory, setSelectedCategory] = useState('')
  // The category tap fires a 500ms close animation before the push, so without
  // this the row sits there looking inert for the whole wait.
  const [pendingCategory, setPendingCategory] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const itemsRef = useRef<HTMLDivElement[]>([])
  const tlRef = useRef<gsap.core.Timeline | null>(null)

  const selectedLabel = categories.find(c => c.value === selectedCategory)?.label || ''

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set(itemsRef.current, { y: 30, opacity: 0 })
      const tl = gsap.timeline({ paused: true })
      tl.to(containerRef.current, { height: 380, duration: 0.4, ease: 'power3.out' })
        .to(itemsRef.current, { y: 0, opacity: 1, duration: 0.3, ease: 'power3.out', stagger: 0.06 }, '-=0.2')
      tlRef.current = tl
    }, containerRef)
    return () => ctx.revert()
  }, [])

  // Auto-open when navigated with ?open=1
  useEffect(() => {
    if (searchParams.get('open') === '1' && tlRef.current && !isOpen) {
      setTimeout(() => {
        tlRef.current?.play()
        setIsOpen(true)
      }, 300)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const toggleMenu = () => {
    if (!tlRef.current) return
    if (isOpen) {
      tlRef.current.reverse()
    } else {
      tlRef.current.play()
    }
    setIsOpen(!isOpen)
  }

  const selectCategory = (value: string) => {
    if (pendingCategory) return
    setSelectedCategory(value)
    setPendingCategory(value)
    if (tlRef.current) tlRef.current.reverse()
    setIsOpen(false)
    saveFormData({ category: value })
    const clientId = localStorage.getItem('clientId')
    fetch('/api/track/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName: 'category_selected', clientId, metadata: { category: value } }),
    }).catch(() => {})
    setTimeout(() => {
      navigate('/car-details/')
    }, 500)
  }

  return (
    <section className="relative min-h-screen flex flex-col justify-center">
      {/* Overlay removed — now applied globally in LandingPage */}

      <h1 className="sr-only">
        NextService — Βρες συνεργείο αυτοκινήτου στην Ελλάδα και πάρε προσφορές από επαγγελματίες για service, συμπλέκτη, ιμάντα χρονισμού και φανοποιεία
      </h1>

      {/* Content */}
      <div className="relative z-10 px-5 flex flex-col items-center">
        {/* Animated Command Menu */}
        <div
          ref={containerRef}
          className="w-full max-w-[480px] h-[60px] bg-surface-container-lowest/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-outline-variant/10 overflow-hidden"
        >
          {/* Search Bar */}
          <div className="absolute inset-x-0 top-0 h-[60px] flex items-center justify-between px-4 z-10">
            <div className="flex items-center gap-3 flex-1 cursor-pointer" onClick={() => !isOpen && toggleMenu()}>
              <Icon name="search" size="md" className="text-on-surface-variant/50" />
              {selectedCategory ? (
                <span className="text-sm font-bold text-on-surface">{selectedLabel}</span>
              ) : (
                <span className="text-sm text-on-surface-variant/50">Τι χρειάζεται το αυτοκίνητό σου;</span>
              )}
            </div>
            <button
              onClick={toggleMenu}
              className="text-xs font-bold text-on-surface-variant bg-surface-container-high px-3 py-1.5 rounded-lg"
            >
              {isOpen ? 'Κλείσιμο' : 'Άνοιγμα'}
            </button>
          </div>

          {/* Dropdown Items */}
          <div className="absolute inset-x-0 top-[60px] p-2 space-y-1">
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

      {/* Scroll down arrow — desktop only */}
      <div className="hidden md:flex absolute bottom-8 left-1/2 -translate-x-1/2 z-10 animate-bounce">
        <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center">
          <Icon name="keyboard_arrow_down" size="md" className="text-white/70" />
        </div>
      </div>
    </section>
  )
}
