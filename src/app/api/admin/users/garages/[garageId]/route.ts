import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ garageId: string }> }
) {
  try {
    const { garageId } = await params

    const [garageResult, offersResult] = await Promise.all([
      dynamoDB.send(new GetCommand({
        TableName: 'Garages',
        Key: { id: garageId }
      })),
      dynamoDB.send(new QueryCommand({
        TableName: 'Offers',
        IndexName: 'GarageOffersIndex',
        KeyConditionExpression: 'garageId = :garageId',
        ExpressionAttributeValues: { ':garageId': garageId },
        Select: 'COUNT'
      }))
    ])

    const garage = garageResult.Item
    if (!garage) {
      return NextResponse.json({ error: 'Garage not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: garage.id,
      type: 'garage',
      email: garage.email,
      name: garage.companyName || garage.email,
      companyName: garage.companyName,
      phone: garage.mobile || '',
      tin: garage.tin || '',
      address: garage.address || '',
      createdAt: garage.createdAt || '',
      isActive: garage.isActive ?? false,
      offerCount: offersResult.Count || 0
    })
  } catch (error) {
    console.error('Admin garage detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch garage' }, { status: 500 })
  }
}
