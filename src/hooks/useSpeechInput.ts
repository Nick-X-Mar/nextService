'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type SpeechFailure = 'denied' | 'no-speech' | 'unavailable'

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

/** Prefixed in Chrome and Safari, absent in Firefox and most in-app browsers. */
function recognitionConstructor(): SpeechRecognitionConstructor | undefined {
  const w = window as unknown as Record<string, SpeechRecognitionConstructor | undefined>
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

/**
 * Dictation in Greek through the browser's own speech recognition.
 *
 * `onText` gets the whole phrase so far on every result, so the field fills in
 * while the person speaks. `continuous` stays off: it stops at the first pause,
 * which suits a short phrase, and Chrome on Android repeats words with it on.
 */
export function useSpeechInput({
  onText,
  onFailure,
}: {
  onText: (text: string) => void
  onFailure: (failure: SpeechFailure) => void
}) {
  // Decided after mount: the server cannot know, and a mismatch breaks hydration.
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const callbacks = useRef({ onText, onFailure })
  callbacks.current = { onText, onFailure }

  useEffect(() => {
    setSupported(!!recognitionConstructor())
    return () => recognitionRef.current?.abort()
  }, [])

  const toggle = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      return
    }
    const Recognition = recognitionConstructor()
    if (!Recognition) return

    const recognition = new Recognition()
    recognition.lang = 'el-GR'
    recognition.interimResults = true
    recognition.continuous = false
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      const text = Array.from(event.results).map((result) => result[0].transcript).join('')
      callbacks.current.onText(text)
    }
    recognition.onerror = (event) => {
      // `aborted` is us: leaving the page, or stopping.
      if (event.error === 'aborted') return
      if (event.error === 'no-speech') callbacks.current.onFailure('no-speech')
      else if (event.error === 'not-allowed') callbacks.current.onFailure('denied')
      else callbacks.current.onFailure('unavailable')
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setListening(false)
    }

    try {
      recognition.start()
      recognitionRef.current = recognition
      setListening(true)
    } catch {
      callbacks.current.onFailure('unavailable')
    }
  }, [])

  return { supported, listening, toggle }
}
