import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { generatePresignedUrls } from '@/utils/s3Service'
import { batchGetById } from '@/utils/batchGetById'
import { presignAttachmentList, type ChatAttachment } from '@/utils/chatAttachments'
import { collectAll } from '@/utils/pagination'
import { declineReasonLabel } from '@/types/declines'
import { messageThread, requestWaiting, type WaitingMessage, type WaitingOffer, type WaitingRequest } from '@/utils/requestWaiting'
import { withMetrics } from '@/utils/withMetrics'
import { TABLES } from '@/lib/tables'

async function _GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params

    // Fetch service request
    const reqResult = await dynamoDB.send(new GetCommand({
      TableName: TABLES.ServiceRequests,
      Key: { id: requestId }
    }))

    const sr = reqResult.Item
    if (!sr) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    // Fetch client, vehicle, and offers in parallel
    const [clientResult, vehicleResult, offersResult, messages, declines] = await Promise.all([
      sr.clientId
        ? dynamoDB.send(new GetCommand({
            TableName: TABLES.Clients,
            Key: { id: sr.clientId }
          }))
        : Promise.resolve({ Item: undefined }),
      sr.vehicleId
        ? dynamoDB.send(new GetCommand({
            TableName: TABLES.Vehicles,
            Key: { id: sr.vehicleId }
          }))
        : Promise.resolve({ Item: undefined }),
      dynamoDB.send(new QueryCommand({
        TableName: TABLES.Offers,
        IndexName: 'ServiceRequestOffersIndex',
        KeyConditionExpression: 'serviceRequestId = :reqId',
        ExpressionAttributeValues: { ':reqId': requestId }
      })),
      collectAll<Record<string, unknown>>((startKey) => dynamoDB.send(new QueryCommand({
        TableName: TABLES.ChatMessages,
        IndexName: 'RequestMessagesIndex',
        KeyConditionExpression: 'requestId = :reqId',
        ExpressionAttributeValues: { ':reqId': requestId },
        ExclusiveStartKey: startKey
      })), 'admin request messages'),
      collectAll<Record<string, unknown>>((startKey) => dynamoDB.send(new QueryCommand({
        TableName: TABLES.RequestDeclines,
        IndexName: 'RequestDeclinesIndex',
        KeyConditionExpression: 'requestId = :reqId',
        ExpressionAttributeValues: { ':reqId': requestId },
        ExclusiveStartKey: startKey
      })), 'admin request declines')
    ])

    const client = clientResult.Item
    const vehicle = vehicleResult.Item
    const offers = offersResult.Items || []

    // A garage can be in this request through an offer, a chat or a decline.
    const threadOf = (m: Record<string, unknown>) => messageThread(m as WaitingMessage)
    const garages = await batchGetById(TABLES.Garages, [
      sr.acceptedGarageId,
      ...offers.map((o) => o.garageId),
      ...messages.map(threadOf),
      ...declines.map((d) => d.garageId as string),
    ], { projection: 'id, companyName, mobile' })
    const garageName = (id: string) => String(garages.get(id)?.companyName || id)

    const threads = new Map<string, Record<string, unknown>[]>()
    for (const message of messages) {
      const key = threadOf(message) ?? ''
      threads.set(key, [...(threads.get(key) ?? []), message])
    }

    // Generate presigned URLs for photos
    const rawPhotoUrls = sr.photoUrls || []
    const photoUrls = rawPhotoUrls.length > 0
      ? await generatePresignedUrls(rawPhotoUrls)
      : []
    const licensePhotoUrl = vehicle?.licensePhotoUrl
      ? (await generatePresignedUrls([vehicle.licensePhotoUrl as string]))[0]
      : undefined

    return NextResponse.json({
      id: sr.id,
      description: sr.description,
      category: sr.serviceCategory || sr.category || '-',
      status: sr.status,
      waiting: requestWaiting(
        sr as WaitingRequest,
        offers as unknown as WaitingOffer[],
        messages as WaitingMessage[],
        garages
      ),
      createdAt: sr.createdAt,
      updatedAt: sr.updatedAt,
      estimatedCost: sr.estimatedCost,
      clientAvailabilityDates: sr.clientAvailabilityDates || [],
      acceptedOfferId: sr.acceptedOfferId,
      appointmentDate: sr.appointmentDate,
      appointmentTime: sr.appointmentTime ?? null,
      appointmentPrice: sr.appointmentPrice,
      cancelledAt: sr.cancelledAt,
      // Completion: what the garage said happened and what it says it charged.
      // `finalAmounts.net` is the figure commission is calculated on, so admin
      // needs to see it next to the quote it may differ from.
      completedAt: sr.completedAt,
      completedBy: sr.completedBy,
      completionOutcome: sr.completionOutcome,
      completionNotes: sr.completionNotes,
      completionReason: sr.completionReason,
      clientConfirmation: sr.clientConfirmation,
      completionPromptedAt: sr.completionPromptedAt,
      finalAmounts: sr.finalAmounts,
      photoUrls,
      client: client
        ? {
            id: client.id,
            firstName: client.firstName,
            lastName: client.lastName,
            email: client.email,
            phoneNumber: client.phoneNumber,
            address: client.address
          }
        : null,
      vehicle: vehicle
        ? {
            brand: vehicle.brand,
            model: vehicle.model,
            nickname: vehicle.nickname,
            modelYear: vehicle.modelYear,
            licensePlate: vehicle.licensePlate,
            vinNumber: vehicle.vinNumber,
            engineNumber: vehicle.engineNumber,
            color: vehicle.color,
            engineCC: vehicle.engineCC,
            fuelType: vehicle.fuelType,
            licensePhotoUrl,
            is4x4: vehicle.is4x4,
            isAutomatic: vehicle.isAutomatic,
            isTurbo: vehicle.isTurbo
          }
        : null,
      offers: offers.map((o) => ({
        id: o.id,
        garageId: o.garageId,
        garageName: garageName(o.garageId),
        offerAmount: o.offerAmount,
        benefits: o.benefits || [],
        availabilityDates: o.availabilityDates || [],
        clientAvailabilityDates: o.clientAvailabilityDates || [],
        status: o.status,
        createdAt: o.createdAt
      })),
      threads: await Promise.all([...threads].map(async ([garageId, rows]) => ({
        garageId,
        garageName: garageId ? garageName(garageId) : 'Χωρίς συνεργείο',
        messages: await Promise.all(
          rows
            .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))
            .map(async (m) => ({
              id: m.id,
              senderType: m.senderType,
              senderName: m.senderName,
              message: m.message,
              timestamp: m.timestamp,
              attachments: m.attachments
                ? (await presignAttachmentList(m.attachments as ChatAttachment[])).map((a) => a.url)
                : [],
            }))
        ),
      }))),
      declines: declines.map((d) => ({
        garageId: d.garageId,
        garageName: garageName(d.garageId as string),
        reason: declineReasonLabel(d.reason as string, d.reasonText as string | undefined),
        createdAt: d.createdAt,
      })),
    })
  } catch (error) {
    console.error('Admin request detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch request' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
