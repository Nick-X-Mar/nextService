import { NextRequest, NextResponse } from 'next/server'
import { requireClient } from '@/utils/requireAuth'
import { loadClientWorkspace, clientThreads, type ClientThread } from '@/utils/clientThreads'
import { batchGetById } from '@/utils/batchGetById'
import { withMetrics } from '@/utils/withMetrics'
import { TABLES } from '@/lib/tables'

/**
 * The client's conversations, one row per (request, garage), ready to render.
 *
 * Built from the same `clientThreads` the Μηνύματα badge counts, so every
 * conversation behind the badge is listed and can be opened — and therefore
 * cleared. The list used to be assembled in the browser per request rather
 * than per garage: a request with two garages writing showed as one row, and
 * on a phone (where the thread picker is hidden) the second garage could not
 * be reached at all.
 */
async function _GET(request: NextRequest) {
  try {
    const clientId = requireClient(request)
    if (clientId instanceof NextResponse) return clientId

    const threads = clientThreads(await loadClientWorkspace(clientId))
    const garages = await batchGetById(TABLES.Garages, threads.map((t) => t.garageId), {
      projection: 'id, companyName, logoUrl',
    })

    const shape = (t: ClientThread) => {
      const garage = garages.get(t.garageId)
      return {
        ...t,
        garageName: (garage?.companyName as string | undefined) || 'Συνεργείο',
        garageLogoUrl: (garage?.logoUrl as string | undefined) ?? null,
      }
    }
    const newestFirst = (a: ClientThread, b: ClientThread) => b.activityAt.localeCompare(a.activityAt)

    return NextResponse.json({
      success: true,
      open: threads.filter((t) => t.bucket === 'open').sort(newestFirst).map(shape),
      appointments: threads.filter((t) => t.bucket === 'appointment').sort(newestFirst).map(shape),
      history: threads.filter((t) => t.bucket === 'history').sort(newestFirst).map(shape),
    }, {
      headers: { 'Cache-Control': 'no-store, private' },
    })
  } catch (error) {
    console.error('Error fetching client chats:', error)
    return NextResponse.json({ error: 'Error fetching client chats' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
