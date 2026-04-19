/**
 * POST /api/properties/[id]/esign
 *
 * Creates an EsignDocument record with status PENDING.
 * No real provider call in Phase 21 — adapter logs to console.
 *
 * Body: { fileId?: string, name?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: propertyId } = await params

  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } })
  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const name = (body.name as string | undefined) ?? 'Document Signing Request'

  // Stub: log and create record
  console.log(`[esign] STUB request for property ${propertyId}: "${name}"`)

  const doc = await (prisma as any).esignDocument.create({
    data: {
      propertyId,
      name,
      status: 'PENDING',
      storageKey: body.fileId ? `file-ref:${body.fileId}` : undefined,
    },
  })

  return NextResponse.json({ success: true, data: doc }, { status: 201 })
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: propertyId } = await params

  const docs = await (prisma as any).esignDocument.findMany({
    where: { propertyId },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(docs)
}
