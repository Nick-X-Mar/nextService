import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { getAdminFromRequest } from '@/utils/adminAuth'
import { verifyPassword, hashPassword } from '@/utils/passwordService'
import { ensureAdminUsersTable, ADMIN_USERS_TABLE_NAME } from '@/utils/ensureAdminTables'

export async function POST(request: NextRequest) {
  try {
    await ensureAdminUsersTable()

    const admin = await getAdminFromRequest(request)
    if (!admin) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { currentPassword, newPassword } = await request.json()

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Both passwords are required' }, { status: 400 })
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 })
    }

    const result = await dynamoDB.send(new GetCommand({
      TableName: ADMIN_USERS_TABLE_NAME,
      Key: { adminId: admin.adminId }
    }))

    if (!result.Item) {
      return NextResponse.json({ error: 'Admin not found' }, { status: 404 })
    }

    const valid = await verifyPassword(currentPassword, result.Item.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 })
    }

    const newHash = await hashPassword(newPassword)

    await dynamoDB.send(new UpdateCommand({
      TableName: ADMIN_USERS_TABLE_NAME,
      Key: { adminId: admin.adminId },
      UpdateExpression: 'SET passwordHash = :hash, updatedAt = :now',
      ExpressionAttributeValues: {
        ':hash': newHash,
        ':now': new Date().toISOString()
      }
    }))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Change password error:', error)
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 })
  }
}
