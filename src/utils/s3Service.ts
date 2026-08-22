import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { fromIni } from '@aws-sdk/credential-provider-ini'
import path from 'path'

// Helper to load shared-credentials file in local dev
const loadLocalCredentials = () =>
  fromIni({
    filepath: path.join(process.cwd(), '.aws', 'credentials'),
    configFilepath: path.join(process.cwd(), '.aws', 'config'),
    profile: 'default'
  });

// AWS S3 configuration - match working project pattern
const getS3Config = () => {
  const isProdOrStaging = ['production', 'staging'].includes(process.env.NODE_ENV)
  
  const config: {
    region: string
    credentials?: { accessKeyId: string; secretAccessKey: string } | ReturnType<typeof fromIni>
  } = {
    region: process.env.REGION || 'eu-central-1'
  }

  // Only add credentials if they are explicitly provided OR in development
  if (process.env.ACCESS_KEY_ID && process.env.SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.ACCESS_KEY_ID,
      secretAccessKey: process.env.SECRET_ACCESS_KEY
    }
    console.log('🔧 S3: Using explicit credentials')
  } else if (!isProdOrStaging) {
    // In development, use local AWS credentials
    config.credentials = loadLocalCredentials()
    console.log('🔧 S3: Using local AWS credentials')
  } else {
    // In production/staging, rely on IAM role - no credentials specified
    console.log('🔧 S3: Using IAM role (no explicit credentials)')
  }

  return config
}

const s3Client = new S3Client(getS3Config())

// Debug logging
console.log('🔧 S3 Environment:', {
  REGION: process.env.REGION || 'NOT SET',
  S3_BUCKET_NAME: process.env.S3_BUCKET_NAME || 'NOT SET',
  hasAccessKey: !!process.env.ACCESS_KEY_ID,
  hasSecretKey: !!process.env.SECRET_ACCESS_KEY
})

// S3 bucket configuration
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'nextservice-uploads-staging'
const BUCKET_REGION = process.env.REGION || 'eu-central-1'

/**
 * MIME types accepted for any user-uploaded image.
 *
 * The pickers in the UI all filter on `image/*`, so this list has to cover what
 * phones actually produce, not just what a desktop browser exports: iOS shoots
 * HEIC/HEIF, and images forwarded through Viber/WhatsApp arrive as WebP. Those
 * used to be accepted by the browser and then rejected here, which — because
 * validation failed the whole batch — silently cost the user every photo they
 * had attached.
 *
 * Uploads are normalised to JPEG client-side (`utils/imageCompression.ts`);
 * this list is the server-side backstop for anything that skipped it.
 */
export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]

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
/**
 * Reduces an untrusted upload filename to something safe to embed in an S3 key.
 *
 * The name comes straight from the client's multipart part and is fully
 * attacker-controlled. Anything outside [A-Za-z0-9.-] becomes an underscore,
 * and runs of dots are collapsed so `../../` can't survive in any form — a key
 * containing `..` escapes the intended `folder/` prefix once any client or CDN
 * normalises the URL path.
 */
const sanitizeFileName = (name: string): string =>
  (name || 'file')
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.-]+/, '')
    .slice(0, 100) || 'file'

export const uploadFileToS3 = async (
  file: File,
  folder: string,
  fileName?: string
): Promise<UploadResult> => {
  try {
    // Generate unique filename if not provided.
    // NOTE: the caller-supplied `fileName` is sanitised too. It used to be
    // trusted as-is, and `uploadMultipleFilesToS3` — the path the public photo
    // upload endpoint actually uses — passed the raw client filename through
    // it, so the sanitising below was bypassed for every real upload.
    const timestamp = Date.now()
    const finalFileName = sanitizeFileName(fileName || `${timestamp}-${file.name}`)
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
        // S3 user metadata is sent as HTTP headers and must be US-ASCII.
        // The app's users are Greek, so `φωτογραφία.jpg` is an ordinary
        // filename here — passing it raw makes Node reject the request with
        // "Invalid character in header content" and the upload fails.
        originalName: encodeURIComponent(file.name).slice(0, 512),
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
  allowedTypes: string[] = ACCEPTED_IMAGE_TYPES
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
 * Generate a presigned download URL for an S3 object.
 * @param key - The S3 key (path) of the file
 * @param expiresIn - URL validity in seconds (default: 15 minutes)
 * @returns Presigned URL string
 */
export const getPresignedDownloadUrl = async (
  key: string,
  expiresIn: number = 900
): Promise<string> => {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  })
  return getSignedUrl(s3Client, command, { expiresIn })
}

/**
 * Convert an array of S3 keys (or legacy public URLs) to presigned URLs.
 * Handles both new keys and old full URLs gracefully.
 */
export const generatePresignedUrls = async (
  keysOrUrls: string[],
  expiresIn: number = 900
): Promise<string[]> => {
  return Promise.all(
    keysOrUrls.map(async (keyOrUrl) => {
      // If it's already a full URL, extract the key
      const key = keyOrUrl.includes('amazonaws.com/')
        ? extractS3KeyFromUrl(keyOrUrl)
        : keyOrUrl
      return getPresignedDownloadUrl(key, expiresIn)
    })
  )
}

/**
 * Convert photo records (with s3Key or s3Url) to use presigned URLs.
 */
export const presignPhotoRecords = async (
  photos: Array<{ s3Key?: string; s3Url?: string; [key: string]: unknown }>,
  expiresIn: number = 900
): Promise<Array<{ s3Key?: string; s3Url: string; [key: string]: unknown }>> => {
  return Promise.all(
    photos.map(async (photo) => {
      const key = photo.s3Key || (photo.s3Url ? extractS3KeyFromUrl(photo.s3Url) : null)
      if (!key) return photo as { s3Key?: string; s3Url: string; [key: string]: unknown }
      const presignedUrl = await getPresignedDownloadUrl(key, expiresIn)
      return { ...photo, s3Url: presignedUrl }
    })
  )
}

// Utility function to check if S3 service is properly configured.
// Credentials are resolved at runtime by the SDK from one of: explicit env vars,
// the local .aws/credentials file (dev), or the attached IAM role (prod).
// We only verify the bucket name here; any missing credentials surface as
// errors from the actual upload/delete call.
export const isS3Configured = (): boolean => {
  return !!BUCKET_NAME
}
