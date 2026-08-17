import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { uploadFileToS3, validateFile, isS3Configured } from '@/utils/s3Service'
import { requireAuth } from '@/utils/requireAuth'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'

const checkUploadRate = createRateLimiter('license-photo-upload', 20, 3600000)

/**
 * Stores the άδεια κυκλοφορίας photo against a vehicle.
 *
 * The request form used to send `licensePhoto: <filename>` in the JSON body and
 * nothing else — the file never left the browser, so neither the client nor the
 * garage ever saw the document the customer had just photographed. This is the
 * missing half: the file goes to S3 and the key lands on the vehicle, where the
 * request endpoints presign it for whoever is allowed to look.
 */
async function _POST(
  request: NextRequest,
  { params }: { params: Promise<{ vehicleId: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { vehicleId } = await params
    if (!vehicleId) {
      return NextResponse.json({ error: 'Vehicle ID is required' }, { status: 400 })
    }

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

    const vehicleRow = await dynamoDB.send(new GetCommand({
      TableName: 'Vehicles',
      Key: { id: vehicleId },
    }))
    if (!vehicleRow.Item) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
    }
    // Only the owner uploads their own άδεια — a garage has no business writing here.
    if (auth.userType !== 'client' || vehicleRow.Item.clientId !== auth.userId) {
      return NextResponse.json(
        { error: 'Δεν έχετε πρόσβαση σε αυτόν τον πόρο' },
        { status: 403 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const validation = validateFile(file, 10, ['image/jpeg', 'image/png', 'image/jpg'])
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const upload = await uploadFileToS3(file, `Requests/${vehicleId}/license`)
    if (!upload.success || !upload.key) {
      return NextResponse.json(
        { error: upload.error || 'Upload failed' },
        { status: 500 }
      )
    }

    // The key, not the public URL — the bucket is private and every reader gets a
    // short-lived presigned URL instead.
    await dynamoDB.send(new UpdateCommand({
      TableName: 'Vehicles',
      Key: { id: vehicleId },
      UpdateExpression: 'SET licensePhotoUrl = :key, updatedAt = :now',
      ExpressionAttributeValues: {
        ':key': upload.key,
        ':now': new Date().toISOString(),
      },
    }))

    return NextResponse.json({ success: true, key: upload.key })
  } catch (error) {
    console.error('Error uploading license photo:', error)
    return NextResponse.json({ error: 'Error uploading license photo' }, { status: 500 })
  }
}

export const POST = withMetrics(_POST)
