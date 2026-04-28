'use client'

import { useState, useEffect } from 'react'

interface TestResult {
  title: string
  status: 'passed' | 'failed'
  duration: number
  error: string | null
}

interface TestSuite {
  title: string
  tests: TestResult[]
}

interface TestSummary {
  total: number
  passed: number
  failed: number
  skipped: number
  duration: number
}

interface TestRunResult {
  success: boolean
  summary: TestSummary
  suites: TestSuite[]
  error?: string
  output?: string
}

export default function TestsPage() {
  const [testFiles, setTestFiles] = useState<string[]>([])
  const [results, setResults] = useState<TestRunResult | null>(null)
  const [running, setRunning] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string>('')

  useEffect(() => {
    fetch('/api/admin/tests/run')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.testFiles) setTestFiles(data.testFiles) })
      .catch(() => {})
  }, [])

  const runTests = async (testFile?: string) => {
    setRunning(true)
    setResults(null)
    try {
      const res = await fetch('/api/admin/tests/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testFile: testFile || undefined }),
      })
      const data = await res.json()
      setResults(data)
    } catch {
      setResults({ success: false, summary: { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 }, suites: [], error: 'Failed to connect' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">E2E Tests</h1>
        <p className="text-sm text-secondary mt-1">Τρέξτε end-to-end tests για να ελέγξετε τα βασικά flows</p>
      </div>

      {/* Controls */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-6">
        <div className="flex items-center gap-4 flex-wrap">
          <select
            value={selectedFile}
            onChange={(e) => setSelectedFile(e.target.value)}
            className="px-4 py-2.5 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm"
          >
            <option value="">Όλα τα tests</option>
            {testFiles.map(f => (
              <option key={f} value={f}>{f.replace('.spec.ts', '')}</option>
            ))}
          </select>

          <button
            onClick={() => runTests(selectedFile)}
            disabled={running}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
              running
                ? 'bg-surface-container text-secondary cursor-not-allowed'
                : 'bg-primary text-on-primary hover:shadow-lg active:scale-95'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {running ? 'hourglass_top' : 'play_arrow'}
            </span>
            {running ? 'Εκτέλεση...' : 'Εκτέλεση Tests'}
          </button>
        </div>

        {running && (
          <div className="mt-4 flex items-center gap-3 text-secondary">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Τα tests τρέχουν, παρακαλώ περιμένετε...</span>
          </div>
        )}
      </div>

      {/* Performance KPIs */}
      {results && results.suites?.length > 0 && (() => {
        const allTests = results.suites.flatMap(s => s.tests)
        const durations = allTests.map(t => t.duration).filter(d => d > 0)
        const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0
        const maxDuration = Math.max(...durations, 0)
        const slowTests = [...allTests].sort((a, b) => b.duration - a.duration).slice(0, 10)

        return (
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant/10 bg-surface-container flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-secondary">speed</span>
              <h3 className="font-bold text-on-surface">Performance KPIs</h3>
            </div>
            <div className="p-6 space-y-4">
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-surface-container rounded-lg p-4">
                  <p className="text-xs text-secondary uppercase tracking-wider">Συνολ. Διάρκεια</p>
                  <p className="text-xl font-bold text-on-surface mt-1">{(results.summary.duration / 1000).toFixed(1)}s</p>
                </div>
                <div className="bg-surface-container rounded-lg p-4">
                  <p className="text-xs text-secondary uppercase tracking-wider">Μέσος χρόνος/test</p>
                  <p className="text-xl font-bold text-on-surface mt-1">{(avgDuration / 1000).toFixed(2)}s</p>
                </div>
                <div className="bg-surface-container rounded-lg p-4">
                  <p className="text-xs text-secondary uppercase tracking-wider">Πιο αργό test</p>
                  <p className="text-xl font-bold text-on-surface mt-1">{(maxDuration / 1000).toFixed(1)}s</p>
                </div>
              </div>

              {/* Slowest tests bar chart */}
              <div>
                <p className="text-sm font-medium text-on-surface mb-3">Top 10 πιο αργά tests</p>
                <div className="space-y-2">
                  {slowTests.map((t, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className={`material-symbols-outlined text-[14px] ${
                        t.status === 'passed' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {t.status === 'passed' ? 'check_circle' : 'cancel'}
                      </span>
                      <span className="text-xs text-on-surface truncate w-60 shrink-0" title={t.title}>{t.title}</span>
                      <div className="flex-1 h-5 bg-surface-container rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            t.duration > avgDuration * 2 ? 'bg-tertiary' :
                            t.duration > avgDuration ? 'bg-secondary' : 'bg-primary'
                          }`}
                          style={{ width: `${maxDuration > 0 ? (t.duration / maxDuration) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-secondary w-14 text-right">{(t.duration / 1000).toFixed(2)}s</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Results */}
      {results && (
        <>
          {/* Summary */}
          <div className={`rounded-xl border p-6 ${
            results.summary.failed === 0
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <span className={`material-symbols-outlined text-3xl ${
                results.summary.failed === 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {results.summary.failed === 0 ? 'check_circle' : 'error'}
              </span>
              <div>
                <h2 className="text-lg font-bold text-on-surface">
                  {results.summary.failed === 0 ? 'Όλα τα tests πέρασαν!' : `${results.summary.failed} test(s) απέτυχαν`}
                </h2>
                <p className="text-sm text-secondary">
                  {results.summary.passed}/{results.summary.total} passed
                  {results.summary.skipped > 0 && ` · ${results.summary.skipped} skipped`}
                  {' · '}
                  {(results.summary.duration / 1000).toFixed(1)}s
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${results.summary.total > 0 ? (results.summary.passed / results.summary.total) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Detailed results per suite */}
          {results.suites?.map((suite, i) => (
            <div key={i} className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
              <div className="px-6 py-4 border-b border-outline-variant/10 bg-surface-container">
                <h3 className="font-bold text-on-surface">{suite.title}</h3>
              </div>
              <div className="divide-y divide-outline-variant/10">
                {suite.tests?.map((t, j) => (
                  <div key={j} className="px-6 py-3 flex items-center gap-3">
                    <span className={`material-symbols-outlined text-[18px] ${
                      t.status === 'passed' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {t.status === 'passed' ? 'check_circle' : 'cancel'}
                    </span>
                    <span className="flex-1 text-sm text-on-surface">{t.title}</span>
                    <span className="text-xs text-secondary">{(t.duration / 1000).toFixed(1)}s</span>
                    {t.error && (
                      <details className="ml-2">
                        <summary className="text-xs text-red-600 cursor-pointer">Error</summary>
                        <pre className="mt-2 text-xs bg-red-50 p-3 rounded-lg overflow-x-auto max-w-xl whitespace-pre-wrap text-red-800">
                          {t.error}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Raw error output if parse failed */}
          {results.error && !results.suites?.length && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6">
              <p className="text-sm font-bold text-red-800 mb-2">Error</p>
              <pre className="text-xs text-red-700 whitespace-pre-wrap">{results.output || results.error}</pre>
            </div>
          )}
        </>
      )}

      {/* Test files info */}
      {!results && !running && testFiles.length > 0 && (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-6">
          <h3 className="font-bold text-on-surface mb-3">Διαθέσιμα test suites</h3>
          <div className="grid gap-2">
            {testFiles.map(f => (
              <div key={f} className="flex items-center gap-3 text-sm">
                <span className="material-symbols-outlined text-[18px] text-secondary">description</span>
                <span className="text-on-surface">{f.replace('.spec.ts', '')}</span>
                <button
                  onClick={() => { setSelectedFile(f); runTests(f) }}
                  className="ml-auto text-xs text-primary font-medium hover:underline"
                >
                  Εκτέλεση
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
