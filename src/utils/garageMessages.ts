import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'

export interface GarageChatMessage {
  requestId: string
  senderId: string
  senderType: 'client' | 'garage'
  senderName?: string
  message: string
  timestamp: string
  garageId?: string
}

/**
 * Every ChatMessage row belonging to one garage.
 *
 * Prefers `GarageMessagesIndex`. That index is declared in the CDK stack, but
 * infrastructure and application deploy on separate cadences — so when the index
 * is not there yet this falls back to the filtered scan this lookup used to be,
 * rather than failing every garage's dashboard.
 *
 * The fallback is temporary by design: once the index is live it stops running.
 * The scan reads the whole ChatMessages table and was the slowest read in the
 * app, so this should not be left un-deployed indefinitely.
 */
export async function fetchGarageMessages(garageId: string): Promise<GarageChatMessage[]> {
  try {
    const res = await dynamoDB.send(new QueryCommand({
      TableName: 'ChatMessages',
      IndexName: 'GarageMessagesIndex',
      KeyConditionExpression: 'garageId = :garageId',
      ExpressionAttributeValues: { ':garageId': garageId },
    }))
    return (res.Items ?? []) as GarageChatMessage[]
  } catch (error) {
    const name = (error as { name?: string })?.name
    // Anything other than "that index does not exist" is a real failure.
    if (name !== 'ValidationException' && name !== 'ResourceNotFoundException') throw error
    const res = await dynamoDB.send(new ScanCommand({
      TableName: 'ChatMessages',
      FilterExpression: 'garageId = :garageId',
      ExpressionAttributeValues: { ':garageId': garageId },
    }))
    return (res.Items ?? []) as GarageChatMessage[]
  }
}
