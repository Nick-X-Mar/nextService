import { NextRequest, NextResponse } from 'next/server'
import { uploadMultipleFilesToS3, validateFile, isS3Configured } from '@/utils/s3Service'
import { dynamoDB } from '@/utils/dynamoService'
import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import { requireAuth } from '@/utils/requireAuth'
import { createRateLimiter } from '@/utils/rateLimit'

const checkUploadRate = createRateLimiter('photo-upload', 20, 3600000)

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    if (!checkUploadRate(auth.userId)) {
      return NextResponse.json(
        { error: 'Πολλά uploads. Δοκιμάστε ξανά σε 1 ώρα.' },
        { status: 429 }
      )
    }

    // Check if S3 service is configured
    if (!isS3Configured()) {
      return NextResponse.json(
        { error: 'S3 service not configured. Please set AWS credentials.' },
        { status: 500 }
      )
    }

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const serviceRequestId = formData.get('serviceRequestId') as string
    const vehicleId = formData.get('vehicleId') as string

    // Validate inputs
    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      )
    }

    if (!serviceRequestId || !vehicleId) {
      return NextResponse.json(
        { error: 'serviceRequestId and vehicleId are required' },
        { status: 400 }
      )
    }

    // Validate each file
    const validationErrors: string[] = []
    const maxSizeMB = 10
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg']

    for (const file of files) {
      const validation = validateFile(file, maxSizeMB, allowedTypes)
      if (!validation.valid) {
        validationErrors.push(`${file.name}: ${validation.error}`)
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'File validation failed', details: validationErrors },
        { status: 400 }
      )
    }

    // Create S3 folder structure: Requests/{vehicleId}/
    const folder = `Requests/${vehicleId}`
    
    // Upload files to S3
    const uploadResults = await uploadMultipleFilesToS3(files, folder)

    // Check for upload failures
    const failedUploads = uploadResults.filter(result => !result.success)
    if (failedUploads.length > 0) {
      return NextResponse.json(
        { 
          error: 'Some files failed to upload', 
          details: failedUploads.map(result => result.error),
          successful: uploadResults.filter(result => result.success)
        },
        { status: 207 } // Multi-Status
      )
    }

    // All uploads successful - prepare photo data for ServiceRequests table
    const photoData: Array<{
      id: string;
      s3Url: string;
      s3Key: string;
      originalName: string;
      fileSize: number;
      contentType: string;
      description: string;
      uploadedAt: string;
    }> = []
    for (let i = 0; i < uploadResults.length; i++) {
      const result = uploadResults[i]
      const file = files[i]
      
      const photoRecord = {
        id: `photo-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
        s3Url: result.url!,
        s3Key: result.key!,
        originalName: file.name,
        fileSize: file.size,
        contentType: file.type,
        description: `Damage photo ${i + 1}`,
        uploadedAt: new Date().toISOString()
      }
      
      photoData.push(photoRecord)
    }

    // Update ServiceRequests table with photo data
    await dynamoDB.send(new UpdateCommand({
      TableName: 'ServiceRequests',
      Key: { id: serviceRequestId },
      UpdateExpression: 'SET photos = :photos, photoUrls = :photoUrls, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':photos': photoData,
        ':photoUrls': photoData.map(p => p.s3Key),
        ':updatedAt': new Date().toISOString()
      }
    }))

    logEvent({
      eventName: EventName.DamagePhotosUploaded,
      actorType: 'client',
      requestId: serviceRequestId,
      source: 'api/upload-photos',
      metadata: { vehicleId, photoCount: photoData.length }
    })

    // Return successful uploads with photo records
    const successfulUploads = uploadResults.map((result, index) => ({
      url: result.url,
      key: result.key,
      originalName: files[index].name,
      photoId: photoData[index].id
    }))

    return NextResponse.json({
      success: true,
      message: `Successfully uploaded ${successfulUploads.length} photo(s)`,
      uploads: successfulUploads,
      photoData: photoData,
      s3Folder: folder
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
