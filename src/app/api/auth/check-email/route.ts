import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'

export async function POST(request: NextRequest) {
  try {
    const { email, userType } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const tableName = userType === 'garage' ? 'Garages' : 'Clients'

    const result = await dynamoDB.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': normalizedEmail
      }
    }))

    const user = result.Items?.[0]

    if (!user) {
      return NextResponse.json({ exists: false })
    }

    return NextResponse.json({
      exists: true,
      hasPassword: !!user.passwordHash,
      firstName: user.firstName || user.name || normalizedEmail.split('@')[0]
    })
  } catch (error) {
    console.error('Check email error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
