import { SNSClient, PublishCommand } from '@aws-sdk/client-sns'

// AWS SNS configuration
const snsClient = new SNSClient({ 
  region: process.env.AWS_REGION || 'eu-central-1', // Use EU region for lower latency to Greece
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
})

// Greek garage phone numbers - in production, these would come from database
const GARAGE_PHONE_NUMBERS: string[] = [
  // Add your garage phone numbers here (international format)
  // Replace with your actual phone number for testing
  // '+306912345678',  // Example Greek mobile number
  // '+302101234567',  // Example Greek landline
  '+306984959044'
]

interface SMSResult {
  successful: number
  failed: number
  errors: string[]
  messageIds: string[]
}

export const sendSMSMessage = async (phoneNumber: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  try {
    // Ensure phone number is in international format
    const formattedNumber = formatPhoneNumber(phoneNumber)
    
    const params = {
      Message: message,
      PhoneNumber: formattedNumber,
      MessageAttributes: {
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional' // For important notifications (higher priority)
        },
        'AWS.SNS.SMS.SenderID': {
          DataType: 'String', 
          StringValue: 'NextService' // Will show as sender name (if supported in country)
        }
      }
    }

    const command = new PublishCommand(params)
    const response = await snsClient.send(command)
    
    console.log(`SMS sent successfully to ${phoneNumber}, MessageId: ${response.MessageId}`)
    return { 
      success: true, 
      messageId: response.MessageId 
    }
  } catch (error) {
    console.error(`Error sending SMS to ${phoneNumber}:`, error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

export const sendSMSNotificationToGarages = async (message: string): Promise<SMSResult> => {
  const result: SMSResult = {
    successful: 0,
    failed: 0,
    errors: [],
    messageIds: []
  }

  if (GARAGE_PHONE_NUMBERS.length === 0) {
    console.warn('No garage phone numbers configured')
    result.errors.push('No garage phone numbers configured')
    return result
  }

  // Truncate message if too long (SMS limit is 160 characters for basic SMS)
  const truncatedMessage = message.length > 160 
    ? message.substring(0, 157) + '...'
    : message

  // Send SMS to each garage
  for (const phoneNumber of GARAGE_PHONE_NUMBERS) {
    try {
      const smsResult = await sendSMSMessage(phoneNumber, truncatedMessage)
      
      if (smsResult.success && smsResult.messageId) {
        result.successful++
        result.messageIds.push(smsResult.messageId)
      } else {
        result.failed++
        result.errors.push(`Failed to send to ${phoneNumber}: ${smsResult.error}`)
      }
      
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100))
      
    } catch (error) {
      result.failed++
      result.errors.push(`Error sending to ${phoneNumber}: ${error}`)
    }
  }

  console.log(`SMS notifications sent: ${result.successful} successful, ${result.failed} failed`)
  return result
}

// Helper function to format phone numbers to international format
export const formatPhoneNumber = (phoneNumber: string): string => {
  // Remove any non-digit characters
  const digits = phoneNumber.replace(/\D/g, '')
  
  // If it starts with 69 (Greek mobile) and is 10 digits, add +30
  if (digits.startsWith('69') && digits.length === 10) {
    return `+30${digits}`
  }
  
  // If it starts with 21 (Athens landline) and is 10 digits, add +30
  if (digits.startsWith('21') && digits.length === 10) {
    return `+30${digits}`
  }
  
  // If it already starts with 30, add +
  if (digits.startsWith('30') && digits.length === 12) {
    return `+${digits}`
  }
  
  // If it already starts with +30, return as is
  if (phoneNumber.startsWith('+30')) {
    return phoneNumber
  }
  
  // Otherwise, assume it's already in correct format or return as is with + if missing
  return phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`
}

// Utility function to validate if SMS service is properly configured
export const isSMSConfigured = (): boolean => {
  return !!(
    process.env.AWS_ACCESS_KEY_ID && 
    process.env.AWS_SECRET_ACCESS_KEY && 
    GARAGE_PHONE_NUMBERS.length > 0
  )
}

// Helper to format service request message for SMS (shorter version)
export const formatSMSMessage = (data: {
  category: string
  description: string
  brand?: string
  model?: string
  modelYear?: string
}): string => {
  const { category, description, brand, model, modelYear } = data
  const categoryText = getCategoryText(category)
  
  // Shorter format for SMS due to character limit
  let message = `🚗 ΝΕΑ ΑΝΑΓΚΗ\n`
  message += `${categoryText}: ${description}\n`
  message += `${brand} ${model} (${modelYear})\n`
  message += `Λεπτομέρειες: nextservice.gr`
  
  return message
}

function getCategoryText(category: string): string {
  const categoryMap: { [key: string]: string } = {
    'michania': 'Μηχανικά',
    'ilektrika': 'Ηλεκτρικά', 
    'fanopeia': 'Φανοποιεία',
    'other': 'Άλλο'
  }
  
  return categoryMap[category] || category
}

