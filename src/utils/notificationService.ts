// SMS notification service using AWS SNS
import { sendSMSNotificationToGarages, formatSMSMessage } from './smsService'

interface SMSNotificationResult {
  successful: number
  failed: number
  errors: string[]
  messageIds: string[]
  summary: string
}

export const sendNotificationToGarages = async (
  serviceRequestData: {
    id: string
    clientId: string
    vehicleId: string
    category: string
    description: string
    status: string
    urgency: string
    estimatedCost?: number
    photoUrls: string[]
    photos: Array<{
      id: string
      s3Url: string
      s3Key: string
      originalName: string
      fileSize: number
      contentType: string
      description?: string
      uploadedAt: string
    }>
    createdAt: string
    updatedAt: string
    vehicle?: {
      brand: string
      model: string
      modelYear: string
    }
  }
): Promise<SMSNotificationResult> => {
  try {
    // Format the SMS message
    const smsMessage = formatSMSMessage(serviceRequestData)
    
    // Send SMS notifications to all garages
    const smsResult = await sendSMSNotificationToGarages(smsMessage)
    
    // Generate summary
    const summary = smsResult.successful > 0 
      ? `Στάλθηκαν επιτυχώς ${smsResult.successful} SMS ειδοποιήσεις`
      : `Αποτυχία αποστολής SMS ειδοποιήσεων: ${smsResult.errors.join(', ')}`
    
    return {
      ...smsResult,
      summary
    }
  } catch (error) {
    console.error('Error sending SMS notifications:', error)
    return {
      successful: 0,
      failed: 1,
      errors: [`Failed to send SMS notifications: ${error}`],
      messageIds: [],
      summary: `Αποτυχία αποστολής SMS ειδοποιήσεων: ${error}`
    }
  }
}

// Helper function to check if SMS service is properly configured
export const isSMSConfigured = (): boolean => {
  return !!(
    process.env.AWS_ACCESS_KEY_ID && 
    process.env.AWS_SECRET_ACCESS_KEY
  )
}

