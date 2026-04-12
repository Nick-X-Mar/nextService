import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { ensureEmailLogsTable } from '@/utils/ensureEventTables'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ emailId: string }> }
) {
  try {
    await ensureEmailLogsTable()

    const { emailId } = await params

    const result = await dynamoDB.send(new GetCommand({
      TableName: 'EmailLogs',
      Key: { emailId }
    }))

    if (!result.Item) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 })
    }

    return NextResponse.json(result.Item)
  } catch (error) {
    console.error('Email detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch email' }, { status: 500 })
  }
}
