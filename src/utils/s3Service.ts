import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

// AWS S3 configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-central-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
})

// S3 bucket configuration
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'nextservice-uploads-staging'
const BUCKET_REGION = process.env.AWS_REGION || 'eu-central-1'

export interface UploadResult {
  success: boolean
  url?: string
  key?: string
  error?: string
}

export interface DeleteResult {
  success: boolean
  error?: string
}

/**
 * Upload a file to S3
 * @param file - The file to upload
 * @param folder - The folder path in S3 (e.g., 'vehicles/license-photos', 'service-requests/damage-photos')
 * @param fileName - Optional custom filename, defaults to timestamp + original name
 * @returns UploadResult with success status and S3 URL
 */
export const uploadFileToS3 = async (
  file: File,
  folder: string,
  fileName?: string
): Promise<UploadResult> => {
  try {
    // Generate unique filename if not provided
    const timestamp = Date.now()
    const finalFileName = fileName || `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const key = `${folder}/${finalFileName}`

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload parameters
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: file.type,
      ContentDisposition: 'inline',
      Metadata: {
        originalName: file.name,
        uploadedAt: new Date().toISOString(),
        fileSize: file.size.toString()
      }
    }

    const command = new PutObjectCommand(uploadParams)
    await s3Client.send(command)

    // Generate the public URL
    const url = `https://${BUCKET_NAME}.s3.${BUCKET_REGION}.amazonaws.com/${key}`

    console.log(`File uploaded successfully: ${url}`)
    
    return {
      success: true,
      url,
      key
    }
  } catch (error) {
    console.error('Error uploading file to S3:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Upload multiple files to S3
 * @param files - Array of files to upload
 * @param folder - The folder path in S3
 * @returns Array of UploadResults
 */
export const uploadMultipleFilesToS3 = async (
  files: File[],
  folder: string
): Promise<UploadResult[]> => {
  const uploadPromises = files.map((file, index) => 
    uploadFileToS3(file, folder, `${Date.now()}-${index}-${file.name}`)
  )
  
  return Promise.all(uploadPromises)
}

/**
 * Delete a file from S3
 * @param key - The S3 key (path) of the file to delete
 * @returns DeleteResult with success status
 */
export const deleteFileFromS3 = async (key: string): Promise<DeleteResult> => {
  try {
    const deleteParams = {
      Bucket: BUCKET_NAME,
      Key: key
    }

    const command = new DeleteObjectCommand(deleteParams)
    await s3Client.send(command)

    console.log(`File deleted successfully: ${key}`)
    
    return {
      success: true
    }
  } catch (error) {
    console.error('Error deleting file from S3:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Extract S3 key from URL
 * @param url - The S3 URL
 * @returns The S3 key (path)
 */
export const extractS3KeyFromUrl = (url: string): string => {
  const urlParts = url.split('/')
  return urlParts.slice(3).join('/') // Remove https://bucket.s3.region.amazonaws.com/
}

/**
 * Validate file before upload
 * @param file - The file to validate
 * @param maxSizeMB - Maximum file size in MB
 * @param allowedTypes - Array of allowed MIME types
 * @returns Validation result
 */
export const validateFile = (
  file: File,
  maxSizeMB: number = 10,
  allowedTypes: string[] = ['image/jpeg', 'image/png', 'image/jpg']
): { valid: boolean; error?: string } => {
  // Check file size
  const maxSizeBytes = maxSizeMB * 1024 * 1024
  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `File size must be less than ${maxSizeMB}MB`
    }
  }

  // Check file type
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `File type must be one of: ${allowedTypes.join(', ')}`
    }
  }

  return { valid: true }
}

/**
 * Generate presigned URL for direct client upload (alternative approach)
 * This would require additional S3 configuration for CORS and presigned URLs
 * For now, we'll use server-side upload for simplicity
 */
export const generatePresignedUrl = async (): Promise<{ success: boolean; url?: string; error?: string }> => {
  // This would require @aws-sdk/s3-request-presigner
  // Implementation can be added later if needed for direct client uploads
  return {
    success: false,
    error: 'Presigned URLs not implemented yet'
  }
}

// Utility function to check if S3 service is properly configured
export const isS3Configured = (): boolean => {
  return !!(
    process.env.AWS_ACCESS_KEY_ID && 
    process.env.AWS_SECRET_ACCESS_KEY && 
    BUCKET_NAME
  )
}
