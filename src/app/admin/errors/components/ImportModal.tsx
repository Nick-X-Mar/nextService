'use client'

import { useState } from 'react'
import Modal from '@/components/Modal'
import Button from '@/components/Button'

interface Resolution {
  fingerprint: string
  status: 'resolved' | 'ignored' | 'open'
  notes?: string
}

interface ImportPreview {
  filename: string
  resolutions: Resolution[]
  warnings: string[]
}

interface ImportResult {
  appliedCount: number
  clearedCount: number
  errorsCount: number
  errors: { fingerprint?: string; reason: string }[]
}

interface ImportModalProps {
  isOpen: boolean
  onClose: () => void
  onApplied: () => void
}

const FINGERPRINT_RE = /^err_[a-f0-9]{8}$/

export default function ImportModal({ isOpen, onClose, onApplied }: ImportModalProps) {
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const reset = () => {
    setPreview(null)
    setParseError(null)
    setResult(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleFile = async (file: File) => {
    reset()
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (parsed.version !== 1) {
        setParseError('Άκυρη έκδοση — χρειάζεται { "version": 1 }.')
        return
      }
      if (!Array.isArray(parsed.resolutions)) {
        setParseError('Λείπει το πεδίο "resolutions" (πίνακας).')
        return
      }
      const warnings: string[] = []
      const resolutions: Resolution[] = []
      for (const r of parsed.resolutions) {
        if (!r || typeof r.fingerprint !== 'string' || !FINGERPRINT_RE.test(r.fingerprint)) {
          warnings.push(`Παράβλεψη — άκυρο fingerprint: ${JSON.stringify(r?.fingerprint)}`)
          continue
        }
        if (
          r.status !== 'resolved' &&
          r.status !== 'ignored' &&
          r.status !== 'open'
        ) {
          warnings.push(`Παράβλεψη ${r.fingerprint} — άκυρο status: ${JSON.stringify(r.status)}`)
          continue
        }
        resolutions.push({
          fingerprint: r.fingerprint,
          status: r.status,
          notes: typeof r.notes === 'string' ? r.notes : undefined
        })
      }
      setPreview({ filename: file.name, resolutions, warnings })
    } catch (err) {
      setParseError(`Αδύνατο το parsing: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  const handleApply = async () => {
    if (!preview) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/errors/import/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 1,
          filename: preview.filename,
          resolutions: preview.resolutions
        })
      })
      const data = (await res.json()) as ImportResult & { error?: string }
      if (!res.ok) {
        setParseError(data.error || 'Αποτυχία import')
        return
      }
      setResult(data)
      onApplied()
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'unknown error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import resolutions από Claude" size="xl">
      <div className="space-y-4">
        {!preview && !result && (
          <>
            <p className="text-sm text-on-surface/70">
              Ανέβασε ένα JSON αρχείο με resolutions. Σχήμα:
            </p>
            <pre className="text-xs bg-surface-container rounded-lg border border-outline-variant/20 p-3 font-mono overflow-auto">
{`{
  "version": 1,
  "resolutions": [
    { "fingerprint": "err_a3f9b2c1", "status": "resolved", "notes": "Null guard added" },
    { "fingerprint": "err_b7e2f4d3", "status": "ignored",  "notes": "External flake" },
    { "fingerprint": "err_c1d2e3f4", "status": "open" }
  ]
}`}
            </pre>
            <label className="block">
              <span className="sr-only">Επίλεξε JSON αρχείο</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFile(file)
                }}
                className="block w-full text-sm text-on-surface/70 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary file:text-on-primary hover:file:bg-primary/90"
              />
            </label>
          </>
        )}

        {parseError && (
          <div className="text-sm text-error bg-error-container/30 rounded-lg p-3">
            {parseError}
          </div>
        )}

        {preview && !result && (
          <>
            <div className="text-sm text-on-surface/70">
              <span className="font-medium">{preview.filename}</span> — {preview.resolutions.length}{' '}
              έγκυρες εγγραφές
            </div>
            <div className="border border-outline-variant/20 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-container text-on-surface/60 text-xs uppercase">
                  <tr>
                    <th className="text-left px-3 py-2">Fingerprint</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {preview.resolutions.map((r) => (
                    <tr key={r.fingerprint}>
                      <td className="px-3 py-2 font-mono text-xs">{r.fingerprint}</td>
                      <td className="px-3 py-2">{r.status}</td>
                      <td className="px-3 py-2 text-on-surface/70">{r.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.warnings.length > 0 && (
              <details className="text-xs text-on-surface/60">
                <summary className="cursor-pointer">{preview.warnings.length} warnings</summary>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  {preview.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={reset} disabled={submitting}>
                Ακύρωση
              </Button>
              <Button variant="primary" size="sm" onClick={handleApply} loading={submitting}>
                Apply
              </Button>
            </div>
          </>
        )}

        {result && (
          <div className="space-y-3">
            <div className="text-sm">
              <p>
                <span className="font-medium text-on-surface">{result.appliedCount}</span> resolved/ignored
                εφαρμόστηκαν.
              </p>
              {result.clearedCount > 0 && (
                <p>
                  <span className="font-medium text-on-surface">{result.clearedCount}</span> reopened
                  (status=open).
                </p>
              )}
              {result.errorsCount > 0 && (
                <p className="text-error">
                  <span className="font-medium">{result.errorsCount}</span> errors —
                  δες λεπτομέρειες παρακάτω.
                </p>
              )}
            </div>
            {result.errors.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-error space-y-1">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    <span className="font-mono">{e.fingerprint || '(no id)'}</span> — {e.reason}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end">
              <Button variant="primary" size="sm" onClick={handleClose}>
                Κλείσιμο
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
