import { NextRequest, NextResponse } from 'next/server'
import {
  uploadMultipleFilesToS3,
  validateFile,
  isS3Configured,
  ACCEPTED_IMAGE_TYPES,
} from '@/utils/s3Service'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import { requireAuth } from '@/utils/requireAuth'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'
import { broadcastRequestPhotos } from '@/utils/requestBroadcast'
import { randomUUID } from 'crypto'

const checkUploadRate = createRateLimiter('photo-upload', 60, 3600000)

const MAX_SIZE_MB = 15
// Upper bound on how many photos one request can carry. Generous enough that
// nobody hits it honestly, low enough that the presigning fan-out on every
// read of the request stays cheap.
const MAX_PHOTOS_PER_REQUEST = 12

interface PhotoRecord {
  id: string
  s3Url: string
  s3Key: string
  originalName: string
  fileSize: number
  contentType: string
  description: string
  uploadedAt: string
}

async function _POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    if (!checkUploadRate(auth.userId)) {
      return NextResponse.json(
        { error: 'Πολλά uploads. Δοκιμάστε ξανά σε 1 ώρα.' },
        { status: 429 }
      )
    }

    if (!isS3Configured()) {
      return NextResponse.json(
        { error: 'S3 service not configured. Please set AWS credentials.' },
        { status: 500 }
      )
    }

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const serviceRequestId = formData.get('serviceRequestId') as string

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'Δεν στάλθηκε καμία φωτογραφία' }, { status: 400 })
    }

    if (!serviceRequestId) {
      return NextResponse.json({ error: 'serviceRequestId is required' }, { status: 400 })
    }

    // The request row is the authority for both ownership and the vehicle id.
    // `vehicleId` used to arrive in the form body and was written into the S3
    // key unchecked, so the caller chose where their upload landed and could
    // attach photos to a request belonging to somebody else.
    const existing = await dynamoDB.send(new GetCommand({
      TableName: 'ServiceRequests',
      Key: { id: serviceRequestId },
    }))
    if (!existing.Item) {
      return NextResponse.json({ error: 'Το αίτημα δεν βρέθηκε' }, { status: 404 })
    }
    if (auth.userType !== 'client' || existing.Item.clientId !== auth.userId) {
      return NextResponse.json(
        { error: 'Δεν έχετε πρόσβαση σε αυτόν τον πόρο' },
        { status: 403 }
      )
    }

    const vehicleId = existing.Item.vehicleId as string | undefined
    if (!vehicleId) {
      return NextResponse.json(
        { error: 'Το αίτημα δεν έχει συνδεδεμένο όχημα' },
        { status: 409 }
      )
    }

    const currentPhotos = (existing.Item.photos as PhotoRecord[] | undefined) ?? []
    const remainingSlots = MAX_PHOTOS_PER_REQUEST - currentPhotos.length
    if (remainingSlots <= 0) {
      return NextResponse.json(
        { error: `Το αίτημα έχει ήδη τις μέγιστες ${MAX_PHOTOS_PER_REQUEST} φωτογραφίες` },
        { status: 409 }
      )
    }

    // Validation is per-file and no longer fatal for the batch. Rejecting all
    // three photos because one was a 12MB HEIC is how people ended up with
    // requests that had no photos at all and no idea why.
    const accepted: File[] = []
    const rejected: string[] = []
    for (const file of files.slice(0, remainingSlots)) {
      const validation = validateFile(file, MAX_SIZE_MB, ACCEPTED_IMAGE_TYPES)
      if (validation.valid) {
        accepted.push(file)
      } else {
        rejected.push(`${file.name}: ${validation.error}`)
      }
    }
    if (files.length > remainingSlots) {
      rejected.push(`Αποθηκεύτηκαν οι πρώτες ${remainingSlots} φωτογραφίες (όριο ${MAX_PHOTOS_PER_REQUEST}).`)
    }

    if (accepted.length === 0) {
      return NextResponse.json(
        { error: 'Καμία φωτογραφία δεν ήταν έγκυρη', details: rejected },
        { status: 400 }
      )
    }

    const folder = `Requests/${vehicleId}`
    const uploadResults = await uploadMultipleFilesToS3(accepted, folder)

    // Keep whatever made it. A partial batch used to return 207 and write
    // nothing, so files that were already sitting in S3 were never recorded
    // against the request and became invisible orphans.
    const photoData: PhotoRecord[] = []
    uploadResults.forEach((result, i) => {
      const file = accepted[i]
      if (!result.success || !result.key || !result.url) {
        rejected.push(`${file.name}: ${result.error || 'upload failed'}`)
        return
      }
      photoData.push({
        id: `photo-${randomUUID()}`,
        s3Url: result.url,
        s3Key: result.key,
        originalName: file.name,
        fileSize: file.size,
        contentType: file.type,
        description: `Damage photo ${currentPhotos.length + photoData.length + 1}`,
        uploadedAt: new Date().toISOString(),
      })
    })

    if (photoData.length === 0) {
      return NextResponse.json(
        { error: 'Η αποστολή των φωτογραφιών απέτυχε', details: rejected },
        { status: 502 }
      )
    }

    // Append, never replace. This endpoint is now called from the submission
    // wizard *and* from the request page afterwards, so a second call must add
    // to the set rather than wipe what the first one stored.
    await dynamoDB.send(new UpdateCommand({
      TableName: 'ServiceRequests',
      Key: { id: serviceRequestId },
      UpdateExpression:
        'SET photos = list_append(if_not_exists(photos, :empty), :photos), ' +
        'photoUrls = list_append(if_not_exists(photoUrls, :empty), :photoUrls), ' +
        'updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':photos': photoData,
        ':photoUrls': photoData.map(p => p.s3Key),
        ':empty': [],
        ':updatedAt': new Date().toISOString(),
      },
    }))

    logEvent({
      eventName: EventName.DamagePhotosUploaded,
      actorType: 'client',
      requestId: serviceRequestId,
      source: 'api/upload-photos',
      metadata: { vehicleId, photoCount: photoData.length, rejectedCount: rejected.length }
    })

    // Garage dashboards render the request card the moment it is created,
    // which is before these photos exist. Push the now-complete photo set so
    // the open dashboards stop showing a photoless card until someone reloads.
    void broadcastRequestPhotos(serviceRequestId)

    return NextResponse.json({
      success: true,
      message: `Successfully uploaded ${photoData.length} photo(s)`,
      uploads: photoData.map(p => ({
        url: p.s3Url,
        key: p.s3Key,
        originalName: p.originalName,
        photoId: p.id,
      })),
      photoData,
      // Non-empty when some files were dropped. The caller surfaces this
      // instead of treating the whole submission as failed.
      rejected,
      s3Folder: folder,
    })

  } catch (error) {
    console.error('Error in photo upload API:', error)
    return NextResponse.json(
      { error: 'Internal server error during photo upload' },
      { status: 500 }
    )
  }
}

// Handle OPTIONS request for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export const POST = withMetrics(_POST)
