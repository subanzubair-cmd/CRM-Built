import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ApiToken } from '@crm/database'
import crypto from 'crypto'

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as { id?: string }).id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = await ApiToken.findOne({
    where: { userId },
    order: [['createdAt', 'DESC']],
  })

  if (!token) {
    return NextResponse.json({ data: null })
  }

  return NextResponse.json({
    data: {
      id: token.id,
      prefix: token.prefix,
      createdAt: token.createdAt,
      lastUsedAt: token.lastUsedAt,
    },
  })
}

export async function POST(_req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as { id?: string }).id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Delete any existing tokens for this user
  await ApiToken.destroy({ where: { userId } })

  // Generate a random 32-char hex token
  const rawToken = crypto.randomBytes(16).toString('hex') // 32 hex chars
  const fullToken = `hp_${rawToken}`
  const prefix = `hp_${rawToken.slice(0, 8)}`
  const tokenHash = crypto.createHash('sha256').update(fullToken).digest('hex')

  const apiToken = await ApiToken.create({
    userId,
    tokenHash,
    prefix,
  })

  return NextResponse.json({
    data: {
      id: apiToken.id,
      token: fullToken, // only returned once
      prefix: apiToken.prefix,
      createdAt: apiToken.createdAt,
    },
  }, { status: 201 })
}
