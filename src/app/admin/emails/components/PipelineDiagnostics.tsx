'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Spinner from '@/components/Spinner'

interface DestinationCheck {
  name: string
  enabled: boolean
  matchingEventTypes: string[]
  missingEventTypes: string[]
  snsTopicArn?: string
  cloudWatchEnabled: boolean
  kinesisFirehoseEnabled: boolean
}

interface DiagnoseResult {
  configSetName: string
  envVarSet: boolean
  notificationsEnabled: boolean
  configSet: {
    exists: boolean
    error?: string
    eventDestinations: DestinationCheck[]
    hasEnabledSnsDestination: boolean
    coversAllEvents: boolean
  }
  pipelineHealth: {
    totalLast24h: number
    queued: number
    sent: number
    delivered: number
    opened: number
    clicked: number
    bounced: number
    failed: number
    stuckQueued: number
    stuckSent: number
    oldestStuckSentMinutes: number | null
  }
  verdict: {
    status: 'healthy' | 'degraded' | 'broken'
    issues: string[]
    nextSteps: string[]
  }
}

interface TestStatus {
  found: boolean
  emailId?: string
  status?: string
  sentAt?: string
  deliveredAt?: string
  openedAt?: string
  clickedAt?: string
  bouncedAt?: string
  complainedAt?: string
  errorMessage?: string
}

const VERDICT_STYLES = {
  healthy: 'bg-green-50 border-green-300 text-green-800',
  degraded: 'bg-yellow-50 border-yellow-300 text-yellow-800',
  broken: 'bg-red-50 border-red-300 text-red-800'
}

function formatLifecycleAge(ts?: string): string {
  if (!ts) return '–'
  const ms = Date.now() - new Date(ts).getTime()
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m ago`
  return `${Math.round(ms / 3600_000)}h ago`
}

interface Props {
  onTestEmailLifecycleProgressed?: () => void
}

export default function PipelineDiagnostics({ onTestEmailLifecycleProgressed }: Props) {
  const [diag, setDiag] = useState<DiagnoseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [testRecipient, setTestRecipient] = useState('')
  const [testStatus, setTestStatus] = useState<TestStatus | null>(null)
  const [testRunning, setTestRunning] = useState(false)
  const [testError, setTestError] = useState<string | null>(null)
  const lastSeenStatusRef = useRef<string | undefined>(undefined)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/emails/diagnose/')
      if (res.ok) {
        setDiag(await res.json())
      }
    } catch {
      /* empty */
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // While a test send is in flight we poll its EmailLogs row every 3s for
  // up to 90s. The UI shows the timestamps as they fire (sent → delivered →
  // opened → clicked). 90s is comfortably longer than the 99th-percentile
  // SES delivery-event latency, but short enough that we don't poll forever.
  useEffect(() => {
    if (!testRunning || !testRecipient) return
    const startedAt = Date.now()
    let cancelled = false
    const tick = async () => {
      if (cancelled) return
      try {
        const res = await fetch(
          `/api/admin/emails/test-send/?to=${encodeURIComponent(testRecipient)}`
        )
        if (res.ok) {
          const data: TestStatus = await res.json()
          setTestStatus(data)
          if (data.status && data.status !== lastSeenStatusRef.current) {
            lastSeenStatusRef.current = data.status
            onTestEmailLifecycleProgressed?.()
          }
          // Stop polling once we hit a terminal status or 90s elapsed.
          const terminal = ['delivered', 'opened', 'clicked', 'bounced', 'complained', 'failed', 'rejected']
          if (data.status && terminal.includes(data.status)) {
            setTestRunning(false)
            return
          }
        }
      } catch {
        /* keep polling */
      }
      if (Date.now() - startedAt < 90_000) {
        setTimeout(tick, 3000)
      } else {
        setTestRunning(false)
      }
    }
    tick()
    return () => {
      cancelled = true
    }
  }, [testRunning, testRecipient, onTestEmailLifecycleProgressed])

  const sendTest = async () => {
    setTestError(null)
    setTestStatus(null)
    lastSeenStatusRef.current = undefined
    try {
      const res = await fetch('/api/admin/emails/test-send/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testRecipient || undefined })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setTestError(data.error || `Test send failed (HTTP ${res.status})`)
        return
      }
      const data = await res.json()
      setTestRecipient(data.to)
      setTestRunning(true)
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Test send failed')
    }
  }

  const verdictStyle = diag ? VERDICT_STYLES[diag.verdict.status] : ''

  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">Pipeline Diagnostics</h2>
          <p className="text-xs text-on-surface/60 mt-0.5">
            SES Configuration Set → SNS topic → event-processor Lambda → EmailLogs.
            Surfaces what&apos;s broken before opening the AWS console.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high transition disabled:opacity-50"
        >
          {loading && <Spinner size="sm" />}
          {loading ? 'Checking…' : 'Re-run check'}
        </button>
      </div>

      {/* Verdict banner */}
      {diag && (
        <div className={`rounded-lg border p-3 mb-4 ${verdictStyle}`}>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-xs uppercase tracking-wide font-semibold">
              {diag.verdict.status}
            </span>
            <span className="text-xs">
              ({diag.pipelineHealth.totalLast24h} emails in last 24h)
            </span>
          </div>
          {diag.verdict.issues.length > 0 ? (
            <ul className="text-xs space-y-0.5 list-disc list-inside mt-1">
              {diag.verdict.issues.map((iss) => (
                <li key={iss}>{iss}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs">
              SES events are reaching the processor — deliveries, opens and clicks update normally.
            </p>
          )}
          {diag.verdict.nextSteps.length > 0 && (
            <div className="mt-2 pt-2 border-t border-current/20">
              <p className="text-xs font-semibold mb-1">Next steps:</p>
              <ul className="text-xs space-y-0.5 list-disc list-inside">
                {diag.verdict.nextSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Component status grid */}
      {diag && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          {/* Config block */}
          <div className="bg-surface-container rounded-lg p-3">
            <p className="text-xs font-semibold text-on-surface mb-2">Configuration</p>
            <ul className="text-xs space-y-1 text-on-surface/80">
              <li>
                <span className="inline-block w-3">
                  {diag.envVarSet ? '✓' : '✗'}
                </span>{' '}
                <code>SES_CONFIG_SET</code> = {diag.envVarSet ? `"${diag.configSetName}"` : 'unset'}
              </li>
              <li>
                <span className="inline-block w-3">
                  {diag.notificationsEnabled ? '✓' : '✗'}
                </span>{' '}
                <code>NOTIFICATIONS_ENABLED</code> = {diag.notificationsEnabled ? 'true' : 'false'}
              </li>
              <li>
                <span className="inline-block w-3">
                  {diag.configSet.exists ? '✓' : '✗'}
                </span>{' '}
                Configuration Set exists in SES
                {diag.configSet.error && (
                  <span className="text-red-600 ml-1">— {diag.configSet.error}</span>
                )}
              </li>
              <li>
                <span className="inline-block w-3">
                  {diag.configSet.hasEnabledSnsDestination ? '✓' : '✗'}
                </span>{' '}
                SNS event destination is enabled
              </li>
              <li>
                <span className="inline-block w-3">
                  {diag.configSet.coversAllEvents ? '✓' : '✗'}
                </span>{' '}
                Subscribes to delivery + open + click + bounce + complaint
              </li>
            </ul>
            {diag.configSet.eventDestinations.length > 0 && (
              <div className="mt-2 pt-2 border-t border-outline-variant/20">
                <p className="text-[10px] uppercase text-on-surface/50 mb-1">Destinations</p>
                {diag.configSet.eventDestinations.map((d) => (
                  <div key={d.name} className="text-xs text-on-surface/70 mb-1 last:mb-0">
                    <span className="font-medium">{d.name}</span>{' '}
                    {d.enabled ? (
                      <span className="text-green-600">enabled</span>
                    ) : (
                      <span className="text-red-600">disabled</span>
                    )}
                    <span className="text-on-surface/50">
                      {' '}
                      · {d.matchingEventTypes.join(', ') || '(no events)'}
                    </span>
                    {d.missingEventTypes.length > 0 && (
                      <span className="text-red-600">
                        {' '}
                        · missing: {d.missingEventTypes.join(', ')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pipeline health block */}
          <div className="bg-surface-container rounded-lg p-3">
            <p className="text-xs font-semibold text-on-surface mb-2">Last 24h lifecycle</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-on-surface/80">
              <div>queued: {diag.pipelineHealth.queued}</div>
              <div>sent: {diag.pipelineHealth.sent}</div>
              <div>delivered: {diag.pipelineHealth.delivered}</div>
              <div>opened: {diag.pipelineHealth.opened}</div>
              <div>clicked: {diag.pipelineHealth.clicked}</div>
              <div>bounced: {diag.pipelineHealth.bounced}</div>
              <div>failed: {diag.pipelineHealth.failed}</div>
            </div>
            <div className="mt-2 pt-2 border-t border-outline-variant/20 text-xs">
              <p
                className={
                  diag.pipelineHealth.stuckQueued > 0 ? 'text-red-600' : 'text-on-surface/60'
                }
              >
                Stuck at queued (&gt;5min): <strong>{diag.pipelineHealth.stuckQueued}</strong>
              </p>
              <p
                className={
                  diag.pipelineHealth.stuckSent > 0 ? 'text-red-600' : 'text-on-surface/60'
                }
              >
                Stuck at sent without delivery (&gt;10min):{' '}
                <strong>{diag.pipelineHealth.stuckSent}</strong>
                {diag.pipelineHealth.oldestStuckSentMinutes !== null && (
                  <span> · oldest {diag.pipelineHealth.oldestStuckSentMinutes}m</span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Test send block */}
      <div className="bg-surface-container rounded-lg p-3">
        <p className="text-xs font-semibold text-on-surface mb-2">End-to-end test send</p>
        <div className="flex gap-2 items-center mb-2">
          <input
            type="email"
            placeholder="recipient@example.com (defaults to your admin email)"
            value={testRecipient}
            onChange={(e) => setTestRecipient(e.target.value)}
            disabled={testRunning}
            className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-outline-variant/30 bg-surface-container-lowest disabled:opacity-50"
          />
          <button
            type="button"
            onClick={sendTest}
            disabled={testRunning || !diag?.notificationsEnabled}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            title={
              !diag?.notificationsEnabled
                ? 'Enable NOTIFICATIONS_ENABLED first'
                : 'Send a test email and watch the lifecycle'
            }
          >
            {testRunning && <Spinner size="sm" />}
            {testRunning ? 'Watching…' : 'Send test'}
          </button>
        </div>
        {testError && <p className="text-xs text-red-600 mt-1">{testError}</p>}
        {testStatus?.found && (
          <div className="text-xs text-on-surface/80 space-y-0.5">
            <p>
              <span className="text-on-surface/50">emailId:</span>{' '}
              <code className="font-mono">{testStatus.emailId}</code>
            </p>
            <p>
              <span className="text-on-surface/50">status:</span>{' '}
              <strong>{testStatus.status}</strong>
            </p>
            <p>
              sent {formatLifecycleAge(testStatus.sentAt)}
              {testStatus.deliveredAt && (
                <span className="text-green-600">
                  {' '}
                  · delivered {formatLifecycleAge(testStatus.deliveredAt)}
                </span>
              )}
              {testStatus.openedAt && (
                <span className="text-green-600">
                  {' '}
                  · opened {formatLifecycleAge(testStatus.openedAt)}
                </span>
              )}
              {testStatus.clickedAt && (
                <span className="text-green-600">
                  {' '}
                  · clicked {formatLifecycleAge(testStatus.clickedAt)}
                </span>
              )}
              {testStatus.bouncedAt && (
                <span className="text-red-600">
                  {' '}
                  · bounced {formatLifecycleAge(testStatus.bouncedAt)}
                </span>
              )}
              {testStatus.errorMessage && (
                <span className="text-red-600"> · {testStatus.errorMessage}</span>
              )}
            </p>
          </div>
        )}
        {testRunning && !testStatus?.deliveredAt && (
          <p className="text-xs text-on-surface/50 mt-1">
            Polling every 3s · stops at delivered/bounced or 90s elapsed.
          </p>
        )}
      </div>
    </div>
  )
}
