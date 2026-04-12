import { NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'

export async function GET() {
  try {
    // Scan Vehicles table for entries with custom brand or model
    const result = await dynamoDB.send(new ScanCommand({
      TableName: 'Vehicles',
      FilterExpression: 'isBrandOther = :true OR isModelOther = :true',
      ExpressionAttributeValues: {
        ':true': true,
      },
    }))

    const vehicles = (result.Items || []).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    // Get unique custom brands and models for summary
    const customBrands = new Set<string>()
    const customModels = new Set<string>()
    for (const v of vehicles) {
      if (v.isBrandOther) customBrands.add(v.brand)
      if (v.isModelOther) customModels.add(`${v.brand} - ${v.model}`)
    }

    return NextResponse.json({
      vehicles,
      total: vehicles.length,
      uniqueCustomBrands: Array.from(customBrands),
      uniqueCustomModels: Array.from(customModels),
    })
  } catch (error) {
    console.error('Error fetching custom vehicles:', error)
    return NextResponse.json({ error: 'Failed to fetch custom vehicles' }, { status: 500 })
  }
}
