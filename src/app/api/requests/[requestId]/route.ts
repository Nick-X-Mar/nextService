import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { getByIdOrNull } from '@/utils/getById'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import { requireActiveGarage, requireAuth, requireOwner } from '@/utils/requireAuth'
import { generatePresignedUrls } from '@/utils/s3Service'
import { withMetrics } from '@/utils/withMetrics'
import { ServiceRequestStatus } from '@/types/statuses'
import { garageClientView, garageVehicleView, resolveWinningGarageId } from '@/utils/garageClientView'

async function _GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    // A pending or deactivated garage still holds a garage session (it needs one
    // for its own status screen), but this response carries the client's name,
    // phone, VIN and άδεια — only an approved garage may read it.
    if (auth.userType === 'garage') {
      const active = await requireActiveGarage(request)
      if (active instanceof NextResponse) return active
    }

    const { requestId } = await params
    const { searchParams } = new URL(request.url)
    // The UI passes ?viewerGarageId=... when a garage views the request. It
    // must name the caller, but the audit below no longer depends on it.
    const viewerGarageId = searchParams.get('viewerGarageId') || undefined

    if (!requestId) {
      return NextResponse.json({
        error: 'Λείπει το αναγνωριστικό αιτήματος'
      }, { status: 400 })
    }

    // Get service request details
    const result = await dynamoDB.send(new GetCommand({
      TableName: 'ServiceRequests',
      Key: { id: requestId }
    }))

    if (!result.Item) {
      return NextResponse.json({
        error: 'Το αίτημα δεν βρέθηκε'
      }, { status: 404 })
    }

    const serviceRequest = result.Item

    // Authorization: clients can only view their own requests
    if (auth.userType === 'client' && auth.userId !== serviceRequest.clientId) {
      return NextResponse.json(
        { error: 'Δεν έχετε πρόσβαση σε αυτόν τον πόρο' },
        { status: 403 }
      )
    }

    // Authorization: if garage passes viewerGarageId, it must match authenticated user
    if (viewerGarageId && auth.userType === 'garage' && viewerGarageId !== auth.userId) {
      return NextResponse.json(
        { error: 'Δεν έχετε πρόσβαση σε αυτόν τον πόρο' },
        { status: 403 }
      )
    }

    // Authorization: a garage may read a request while it is on the open market (the
    // feed shows every pending request to every active garage), or afterwards only if
    // it is actually involved — it bid, or it won. Until this check existed, matching
    // the viewerGarageId to yourself was the *whole* test, so any garage could pull the
    // client's name, phone, plate, VIN and άδεια photo for any request id it had ever
    // seen — including long after the job went to a competitor.
    //
    // Reading it is not seeing the client, though: only the winner, from the
    // acceptance on, gets the PII (see garageClientView). Everyone else who may
    // read — a garage quoting, one that lost, one whose job was cancelled — gets
    // the quoting view.
    let isWinner = false
    if (auth.userType === 'garage') {
      const isOpenMarket = serviceRequest.status === ServiceRequestStatus.PENDING
      isWinner = (await resolveWinningGarageId(serviceRequest)) === auth.userId

      if (!isOpenMarket && !isWinner) {
        const offersOnRequest = await dynamoDB.send(new QueryCommand({
          TableName: 'Offers',
          IndexName: 'ServiceRequestOffersIndex',
          KeyConditionExpression: 'serviceRequestId = :requestId',
          ExpressionAttributeValues: { ':requestId': requestId },
          ProjectionExpression: 'garageId',
        }))
        const hasOwnOffer = (offersOnRequest.Items ?? []).some((o) => o.garageId === auth.userId)

        if (!hasOwnOffer) {
          return NextResponse.json(
            { error: 'Δεν έχετε πρόσβαση σε αυτόν τον πόρο' },
            { status: 403 }
          )
        }
      }
    }

    // Fetch client + vehicle + presigned photo URLs in parallel — they're independent.
    const rawPhotoUrls = serviceRequest.photoUrls || []
    // getByIdOrNull rather than a bare GetCommand: a row missing clientId or
    // vehicleId would otherwise throw and fail this whole Promise.all.
    const [client, vehicle, presignedPhotoUrls] = await Promise.all([
      getByIdOrNull('Clients', serviceRequest.clientId as string | undefined),
      getByIdOrNull('Vehicles', serviceRequest.vehicleId as string | undefined),
      rawPhotoUrls.length > 0 ? generatePresignedUrls(rawPhotoUrls) : Promise.resolve([])
    ])

    const isOwner = auth.userType === 'client'
    // Who may see the identifying fields: the owner, and the garage that won.
    const seesPii = isOwner || isWinner

    // The άδεια κυκλοφορίας lives in a private bucket, so it travels as a
    // short-lived presigned URL like the damage photos do — and is not even
    // signed for a caller who may not see it.
    const licensePhotoUrl = seesPii && vehicle?.licensePhotoUrl
      ? (await generatePresignedUrls([vehicle.licensePhotoUrl as string]))[0]
      : null

    // GDPR audit log: record every garage view, with what it actually exposed.
    // This lets us answer "who saw my data?" and detect scraping behavior.
    // Keyed on the session, not the query param: leaving the param off used to
    // be enough to read the data without leaving a trace.
    if (auth.userType === 'garage') {
      logEvent({
        eventName: EventName.GarageViewedRequestDetails,
        actorType: 'garage',
        actorId: auth.userId,
        garageId: auth.userId,
        clientId: serviceRequest.clientId,
        requestId,
        source: 'api/requests/[requestId]',
        metadata: {
          fieldsExposed: isWinner
            ? [
                'client.firstName',
                'client.lastName',
                'client.phoneNumber',
                'client.email',
                'vehicle.licensePlate',
                'vehicle.vinNumber',
                'vehicle.engineNumber',
                'vehicle.licensePhoto'
              ]
            : ['client.firstName']
        }
      })
    }

    // The owner's own details screen loads from here and needs the bookkeeping
    // fields too; a garage gets only what it needs to quote and do the job.
    const ownerOnly = isOwner
      ? {
          clientId: serviceRequest.clientId,
          vehicleId: serviceRequest.vehicleId,
          updatedAt: serviceRequest.updatedAt,
          finalAmounts: serviceRequest.finalAmounts ?? null,
          completionOutcome: serviceRequest.completionOutcome ?? null,
          completedAt: serviceRequest.completedAt ?? null,
          cancelledAt: serviceRequest.cancelledAt ?? null,
          depositAmount: serviceRequest.depositAmount ?? null,
          remainingAmount: serviceRequest.remainingAmount ?? null,
        }
      : {}

    // The booking itself — when the car is due and at what price — is between
    // the client and the garage that won. A garage that lost learns that it
    // lost (from `status`), not when or for how much a competitor took the job.
    const bookingFields = seesPii
      ? {
          appointmentDate: serviceRequest.appointmentDate,
          appointmentTime: serviceRequest.appointmentTime ?? null,
          appointmentPrice: serviceRequest.appointmentPrice,
        }
      : {}

    return NextResponse.json({
      success: true,
      request: {
        id: serviceRequest.id,
        ...ownerOnly,
        ...bookingFields,
        description: serviceRequest.description,
        category: serviceRequest.category,
        status: serviceRequest.status,
        createdAt: serviceRequest.createdAt,
        clientAvailabilityDates: serviceRequest.clientAvailabilityDates || [],
        photoUrls: presignedPhotoUrls,
        // What the client was shown as a price hint. Not PII, and the offer page
        // tells the garage about it.
        estimatedCost: serviceRequest.estimatedCost ?? null,
        // An opaque offer id: lets a garage tell "my offer lost, then the job was
        // cancelled" from "my booking was cancelled" (garageOfferState) without
        // saying whose offer won.
        acceptedOfferId: serviceRequest.acceptedOfferId,
        // Which garage actually got the job — the chats use it to decide who may
        // still write once the appointment exists. A garage is told only whether
        // that is itself, never which competitor it was.
        acceptedGarageId: isOwner || serviceRequest.acceptedGarageId === auth.userId
          ? serviceRequest.acceptedGarageId ?? null
          : null,
        client: isOwner
          ? client
            ? {
                firstName: client.firstName,
                lastName: client.lastName,
                phoneNumber: client.phoneNumber
              }
            : null
          : garageClientView(client, isWinner),
        vehicle: !vehicle
          ? null
          : isOwner
            ? {
                brand: vehicle.brand,
                model: vehicle.model,
                year: vehicle.year,
                licensePlate: vehicle.licensePlate,
                modelYear: vehicle.modelYear,
                engineCC: vehicle.engineCC,
                engineNumber: vehicle.engineNumber,
                fuelType: vehicle.fuelType,
                vinNumber: vehicle.vinNumber,
                is4x4: vehicle.is4x4,
                isAutomatic: vehicle.isAutomatic,
                isTurbo: vehicle.isTurbo,
                licensePhotoUrl,
                color: vehicle.color,
                nickname: vehicle.nickname
              }
            : { ...garageVehicleView(vehicle, isWinner), licensePhotoUrl }
      }
    })

  } catch (error) {
    console.error('Error fetching service request:', error)
    return NextResponse.json(
      { 
        error: 'Σφάλμα κατά την ανάκτηση του αιτήματος',
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

async function _PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params

    if (!requestId) {
      return NextResponse.json(
        { error: 'Λείπει το αναγνωριστικό αιτήματος' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { clientAvailabilityDates } = body

    if (!Array.isArray(clientAvailabilityDates)) {
      return NextResponse.json(
        { error: 'Οι ημερομηνίες πρέπει να δοθούν ως λίστα' },
        { status: 400 }
      )
    }

    if (clientAvailabilityDates.length > 5) {
      return NextResponse.json(
        { error: 'Μπορείτε να προτείνετε έως 5 ημερομηνίες' },
        { status: 400 }
      )
    }

    // Fetch the request to verify ownership
    const fetchResult = await dynamoDB.send(new GetCommand({
      TableName: 'ServiceRequests',
      Key: { id: requestId }
    }))
    const serviceRequest = fetchResult.Item

    if (!serviceRequest) {
      return NextResponse.json(
        { error: 'Το αίτημα δεν βρέθηκε' },
        { status: 404 }
      )
    }

    const ownerCheck = requireOwner(request, serviceRequest.clientId)
    if (ownerCheck instanceof NextResponse) return ownerCheck

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    const normalizedDates = Array.from(
      new Set(
        clientAvailabilityDates
          .map((date) => (typeof date === 'string' ? date.trim() : ''))
          .filter((date) => date.length > 0)
      )
    ).sort()

    if (normalizedDates.length === 0 && clientAvailabilityDates.length > 0) {
      return NextResponse.json(
        { error: 'Οι ημερομηνίες δεν είναι έγκυρες.' },
        { status: 400 }
      )
    }

    for (const date of normalizedDates) {
      if (!dateRegex.test(date)) {
        return NextResponse.json(
          { error: 'Οι ημερομηνίες πρέπει να είναι σε μορφή YYYY-MM-DD' },
          { status: 400 }
        )
      }

      const parsedDate = new Date(`${date}T00:00:00`)
      if (Number.isNaN(parsedDate.getTime())) {
        return NextResponse.json(
          { error: `Μη έγκυρη ημερομηνία: ${date}` },
          { status: 400 }
        )
      }
    }

    const updateCommand = new UpdateCommand({
      TableName: 'ServiceRequests',
      Key: { id: requestId },
      UpdateExpression: 'SET clientAvailabilityDates = :dates, updatedAt = :updatedAt',
      // Ownership was checked on the read; hold it on the write too.
      ConditionExpression: 'clientId = :clientId',
      ExpressionAttributeValues: {
        ':dates': normalizedDates,
        ':clientId': ownerCheck.userId,
        ':updatedAt': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    })

    let updateResult
    try {
      updateResult = await dynamoDB.send(updateCommand)
    } catch (err) {
      if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
        return NextResponse.json(
          { error: 'Το αίτημα άλλαξε στο μεταξύ. Ανανεώστε τη σελίδα.' },
          { status: 409 }
        )
      }
      throw err
    }

    if (!updateResult.Attributes) {
      return NextResponse.json(
        { error: 'Το αίτημα δεν βρέθηκε' },
        { status: 404 }
      )
    }

    const updatedRequest = updateResult.Attributes

    logEvent({
      eventName: EventName.ClientAvailabilityDatesSubmitted,
      actorType: 'client',
      actorId: updatedRequest.clientId,
      clientId: updatedRequest.clientId,
      requestId,
      source: 'api/requests/[requestId]',
      metadata: { dateCount: normalizedDates.length }
    })

    // Fetch client + vehicle + presigned photo URLs in parallel.
    const rawPatchPhotoUrls = updatedRequest.photoUrls || []
    const [client, vehicle, presignedPatchPhotoUrls] = await Promise.all([
      getByIdOrNull('Clients', updatedRequest.clientId as string | undefined),
      getByIdOrNull('Vehicles', updatedRequest.vehicleId as string | undefined),
      rawPatchPhotoUrls.length > 0 ? generatePresignedUrls(rawPatchPhotoUrls) : Promise.resolve([])
    ])

    return NextResponse.json({
      success: true,
      request: {
        id: updatedRequest.id,
        description: updatedRequest.description,
        category: updatedRequest.category,
        status: updatedRequest.status,
        createdAt: updatedRequest.createdAt,
        updatedAt: updatedRequest.updatedAt,
        clientAvailabilityDates: updatedRequest.clientAvailabilityDates || [],
        photoUrls: presignedPatchPhotoUrls,
        appointmentTime: updatedRequest.appointmentTime ?? null,
        client: client ? {
          firstName: client.firstName,
          lastName: client.lastName,
          phoneNumber: client.phoneNumber
        } : null,
        vehicle: vehicle ? {
          brand: vehicle.brand,
          model: vehicle.model,
          year: vehicle.year,
          licensePlate: vehicle.licensePlate,
          modelYear: vehicle.modelYear,
          engineCC: vehicle.engineCC,
          engineNumber: vehicle.engineNumber,
          fuelType: vehicle.fuelType,
          vinNumber: vehicle.vinNumber,
          is4x4: vehicle.is4x4,
          isAutomatic: vehicle.isAutomatic,
          isTurbo: vehicle.isTurbo
        } : null
      }
    })

  } catch (error) {
    console.error('Error updating client availability dates:', error)
    return NextResponse.json(
      {
        error: 'Δεν ήταν δυνατή η ενημέρωση των προτεινόμενων ημερομηνιών',
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

export const GET = withMetrics(_GET)
export const PATCH = withMetrics(_PATCH)
