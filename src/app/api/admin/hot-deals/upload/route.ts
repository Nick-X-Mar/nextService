import { NextRequest, NextResponse } from 'next/server'
import { uploadFileToS3, validateFile } from '@/utils/s3Service'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const validation = validateFile(file, 10, ['image/jpeg', 'image/png', 'image/webp'])
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const result = await uploadFileToS3(file, 'hot-deals')

    if (!result.success) {
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      url: result.url,
      key: result.key
    })
  } catch (error) {
    console.error('Hot deal upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
