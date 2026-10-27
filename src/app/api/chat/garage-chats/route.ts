import { NextRequest, NextResponse } from 'next/server'
import { requireActiveGarage } from '@/utils/requireAuth'
import { loadGarageWorkspace, garageThreads, type GarageThread } from '@/utils/garageMessages'
import { reviewedRequestIds, withinReviewWindow } from '@/utils/reviewLookup'
import { ServiceRequestStatus } from '@/types/statuses'
import { withMetrics } from '@/utils/withMetrics'

/**
 * The garage's conversations, ready to render.
 *
 * Built from the same `garageThreads` the notification summary counts, so every
 * thread behind the unread badge is in one of these two lists and can be opened
 * — and therefore cleared. The lists used to be assembled in the browser from
 * a different rule (and a request + messages fetch per thread).
 *
 * Ordering: open threads by latest activity; appointments soonest first, so
 * one whose slot has passed and still needs closing sits at the top; completed
 * jobs after them, most recent first. A completed job still owed a review of
 * the client is flagged, which is where the "αξιολόγησε" alert sends a garage
 * with more than one.
 */
function compareAppointments(a: GarageThread, b: GarageThread): number {
  const aDone = a.status === ServiceRequestStatus.COMPLETED
  const bDone = b.status === ServiceRequestStatus.COMPLETED
  if (aDone !== bDone) return aDone ? 1 : -1
  if (aDone) return (b.completedAt ?? '').localeCompare(a.completedAt ?? '')
  const aKey = `${a.appointmentDate ?? '9999-99-99'} ${a.appointmentTime ?? ''}`
  const bKey = `${b.appointmentDate ?? '9999-99-99'} ${b.appointmentTime ?? ''}`
  return aKey.localeCompare(bKey)
}

async function _GET(request: NextRequest) {
  try {
    const garageId = await requireActiveGarage(request)
    if (garageId instanceof NextResponse) return garageId

    const threads = garageThreads(await loadGarageWorkspace(garageId))
    const open = threads
      .filter((t) => t.bucket === 'open')
      .sort((a, b) => b.activityAt.localeCompare(a.activityAt))
    const appointments = threads
      .filter((t) => t.bucket === 'appointment')
      .sort(compareAppointments)

    const reviewable = appointments
      .filter((t) => t.status === ServiceRequestStatus.COMPLETED && withinReviewWindow(t.completedAt))
      .map((t) => t.requestId)
    const reviewed = await reviewedRequestIds(reviewable, 'garage_to_client')
    const owed = new Set(reviewable.filter((id) => !reviewed.has(id)))

    return NextResponse.json({
      success: true,
      open,
      appointments: appointments.map((t) => ({ ...t, needsReview: owed.has(t.requestId) })),
      requestIds: threads.map((t) => t.requestId),
    }, {
      headers: { 'Cache-Control': 'no-store, private' },
    })
  } catch (error) {
    console.error('Error fetching garage chats:', error)
    return NextResponse.json(
      { error: 'Error fetching garage chats' },
      { status: 500 }
    )
  }
}

export const GET = withMetrics(_GET)
