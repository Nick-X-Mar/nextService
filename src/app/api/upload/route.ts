import { NextRequest, NextResponse } from 'next/server'
import { uploadFileToS3, uploadMultipleFilesToS3, validateFile, isS3Configured } from '@/utils/s3Service'
import { getEnvironmentInfo } from '@/utils/dynamoService'

export async function POST(request: NextRequest) {
  try {
    // Check if S3 service is configured
    if (!isS3Configured()) {
      return NextResponse.json(
        { error: 'S3 service not configured. Please set AWS credentials and S3_BUCKET_NAME.' },
        { status: 500 }
      )
    }

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const folder = formData.get('folder') as string
    const type = formData.get('type') as string // 'license-photo' or 'damage-photos'

    // Validate inputs
    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      )
    }

    if (!folder) {
      return NextResponse.json(
        { error: 'Folder path is required' },
        { status: 400 }
      )
    }

    // Validate each file
    const validationErrors: string[] = []
    const maxSizeMB = type === 'license-photo' ? 10 : 10 // Both can be 10MB
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

    // All uploads successful
    const successfulUploads = uploadResults.map(result => ({
      url: result.url,
      key: result.key,
      originalName: files[uploadResults.indexOf(result)].name
    }))

    return NextResponse.json({
      success: true,
      message: `Successfully uploaded ${successfulUploads.length} file(s)`,
      uploads: successfulUploads,
      environment: getEnvironmentInfo()
    })

  } catch (error) {
    console.error('Error in upload API:', error)
    return NextResponse.json(
      { error: 'Internal server error during file upload' },
      { status: 500 }
    )
  }
}

// Handle OPTIONS request for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
