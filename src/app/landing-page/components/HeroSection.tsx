'use client'

import React, { useState, useLayoutEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { gsap } from 'gsap'
import Icon from '@/components/ui/Icon'
import GearSubmitButton from '@/components/GearSubmitButton'
import { saveFormData } from '@/utils/formStorage'

const categories = [
  { icon: 'home_repair_service', label: 'Service', value: 'service' },
  { icon: 'verified', label: 'ΚΤΕΟ', value: 'kteo' },
  { icon: 'tire_repair', label: 'Ελαστικά', value: 'elastika' },
  { icon: 'car_crash', label: 'Φανοποιεία', value: 'fanopeia' },
  { icon: 'oil_barrel', label: 'Λάδια', value: 'oils' },
  { icon: 'settings', label: 'Δίσκος', value: 'disk' },
]

export default function HeroSection() {
  const router = useRouter()
  const [selectedCategory, setSelectedCategory] = useState('')
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
    setSelectedCategory(value)
    if (tlRef.current) tlRef.current.reverse()
    setIsOpen(false)
  }

  const handleSubmit = () => {
    if (!selectedCategory) return
    saveFormData({ category: selectedCategory })
    router.push('/car-details')
  }

  return (
    <section className="relative min-h-screen flex flex-col justify-center">
      {/* Background Image */}
      <picture>
        <source media="(max-width: 767px)" srcSet="/road_mobile.webp" type="image/webp" />
        <source media="(max-width: 767px)" srcSet="/road_mobile.jpg" type="image/jpeg" />
        <source media="(min-width: 768px)" srcSet="/road_desktop.webp" type="image/webp" />
        <img
          src="/road_desktop.jpg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      </picture>
      <div className="absolute inset-0 bg-black/30" />

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
                <Icon
                  name="arrow_forward"
                  size="sm"
                  className={selectedCategory === cat.value ? 'text-primary' : 'text-on-surface-variant/30'}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Submit Button */}
        <div className="w-full max-w-[480px] mt-5">
          <GearSubmitButton
            onClick={handleSubmit}
            disabled={!selectedCategory}
            label="ΣΥΝΕΧΕΙΑ"
          />
        </div>
      </div>
    </section>
  )
}
