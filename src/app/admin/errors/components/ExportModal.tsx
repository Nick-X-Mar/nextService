'use client'

import { useEffect, useState } from 'react'
import Modal from '@/components/Modal'
import Button from '@/components/Button'

type Format = 'md' | 'json'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  range: string
  status: string
}

export default function ExportModal({ isOpen, onClose, range, status }: ExportModalProps) {
  const [format, setFormat] = useState<Format>('md')
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setCopied(false)
      try {
        const res = await fetch(
          `/api/admin/errors/export/?format=${format}&range=${range}&status=${status}`
        )
        const text = await res.text()
        if (!cancelled) setContent(text)
      } catch {
        if (!cancelled) setContent('Σφάλμα φόρτωσης export.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [isOpen, format, range, status])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignored
    }
  }

  const downloadHref = `/api/admin/errors/export?format=${format}&range=${range}&status=${status}&download=1`

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export errors για Claude" size="xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="inline-flex rounded-lg border border-outline-variant/30 overflow-hidden">
            <button
              onClick={() => setFormat('md')}
              className={`px-4 py-2 text-sm font-medium ${
                format === 'md'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-lowest text-on-surface/70 hover:bg-surface-container'
              }`}
            >
              Markdown
            </button>
            <button
              onClick={() => setFormat('json')}
              className={`px-4 py-2 text-sm font-medium ${
                format === 'json'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-lowest text-on-surface/70 hover:bg-surface-container'
              }`}
            >
              JSON
            </button>
          </div>
          <div className="text-xs text-on-surface/50">
            Range: {range} • Status: {status}
          </div>
        </div>

        <div className="bg-surface-container rounded-lg border border-outline-variant/20 max-h-[60vh] overflow-auto">
          {loading ? (
            <div className="p-8 flex items-center justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : (
            <pre className="text-xs text-on-surface font-mono whitespace-pre-wrap break-words p-4">
              {content || '— κενό —'}
            </pre>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-on-surface/50">
            Κάνε copy το markdown και κάντο paste σε Claude conversation. Κάθε error έχει
            stable id (π.χ. <code>err_a3f9b2c1</code>) για αναφορά.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy} disabled={loading || !content}>
              {copied ? 'Copied!' : 'Copy'}
            </Button>
            <a href={downloadHref} download>
              <Button variant="primary" size="sm" disabled={loading}>
                Download
              </Button>
            </a>
          </div>
        </div>
      </div>
    </Modal>
  )
}
