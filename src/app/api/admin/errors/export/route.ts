import { NextRequest, NextResponse } from 'next/server'
import { withMetrics } from '@/utils/withMetrics'
import {
  getErrorGroups,
  type ErrorGroup,
  type LogLevelFilter,
  type StatusFilter
} from '@/utils/errorGroups'
import { shortTitle } from '@/utils/errorFingerprint'
import { STAGE } from '@/lib/site-url'

const VALID_STATUSES: StatusFilter[] = ['open', 'all', 'resolved', 'ignored']
const VALID_LEVELS: LogLevelFilter[] = ['all', 'error', 'warn']

function toMarkdown(groups: ErrorGroup[], range: string, statusFilter: StatusFilter, levelFilter: LogLevelFilter): string {
  const generatedAt = new Date().toISOString()
  const totalOccurrences = groups.reduce((sum, g) => sum + g.count, 0)

  const header = [
    `# NextService Error Report — ${generatedAt}`,
    `Stage: ${STAGE} • Range: last ${range} • Status filter: ${statusFilter} • Level: ${levelFilter}`,
    `${groups.length} unique errors • ${totalOccurrences} total occurrences`,
    ''
  ].join('\n')

  if (groups.length === 0) {
    return `${header}\n_No errors in this view._\n`
  }

  const sections = groups.map((g) => {
    const title = shortTitle(g.title)
    const lines: string[] = []
    lines.push('---', '')
    lines.push(`## ${g.fingerprint} — ${title}`)
    lines.push(`- Level: ${g.level} • Stage: ${g.stage}`)
    if (g.endpoint) lines.push(`- Endpoint: ${g.endpoint}`)
    lines.push(`- Status: ${g.status}`)
    lines.push(`- Occurrences: ${g.count}`)
    lines.push(`- First seen: ${g.firstSeen}`)
    lines.push(`- Last seen:  ${g.lastSeen}`)
    lines.push(`- Log group:  ${g.logGroup}`)
    if (g.notes) lines.push(`- Notes: ${g.notes}`)
    if (g.resolvedAt) lines.push(`- Resolved at: ${g.resolvedAt}`)
    lines.push('')
    lines.push('```')
    lines.push(g.sampleMessage.trim())
    lines.push('```')
    lines.push('')
    return lines.join('\n')
  })

  return `${header}\n${sections.join('\n')}`
}

async function _GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const range = searchParams.get('range') || '24h'
  const format = (searchParams.get('format') || 'md').toLowerCase()
  const rawStatus = (searchParams.get('status') || 'open') as StatusFilter
  const statusFilter: StatusFilter = VALID_STATUSES.includes(rawStatus) ? rawStatus : 'open'
  const download = searchParams.get('download') === '1'
  const rawLevel = (searchParams.get('level') || 'all') as LogLevelFilter
  const levelFilter: LogLevelFilter = VALID_LEVELS.includes(rawLevel) ? rawLevel : 'all'

  let result
  try {
    result = await getErrorGroups({ range, statusFilter, levelFilter })
  } catch (error) {
    console.error('Errors export error:', error)
    return NextResponse.json({ error: 'Failed to build export' }, { status: 500 })
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')

  if (format === 'json') {
    const body = {
      version: 1,
      generatedAt: new Date().toISOString(),
      stage: STAGE,
      range,
      statusFilter,
      levelFilter,
      totalGroups: result.totalGroups,
      groups: result.groups
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8'
    }
    if (download) {
      headers['Content-Disposition'] = `attachment; filename=errors-${range}-${stamp}.json`
    }
    return new NextResponse(JSON.stringify(body, null, 2), { status: 200, headers })
  }

  // default: markdown
  const md = toMarkdown(result.groups, range, statusFilter, levelFilter)
  const headers: Record<string, string> = {
    'Content-Type': 'text/markdown; charset=utf-8'
  }
  if (download) {
    headers['Content-Disposition'] = `attachment; filename=errors-${range}-${stamp}.md`
  }
  return new NextResponse(md, { status: 200, headers })
}

export const GET = withMetrics(_GET)
