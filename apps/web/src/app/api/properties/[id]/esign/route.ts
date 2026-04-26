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
import { Property, EsignDocument } from '@crm/database'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: propertyId } = await params

  const property = await Property.findByPk(propertyId, { attributes: ['id'] })
  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const name = (body.name as string | undefined) ?? 'Document Signing Request'

  // Stub: log and create record
  console.log(`[esign] STUB request for property ${propertyId}: "${name}"`)

  const doc = await EsignDocument.create({
    propertyId,
    name,
    status: 'PENDING',
    storageKey: body.fileId ? `file-ref:${body.fileId}` : null,
  })

  return NextResponse.json({ success: true, data: doc }, { status: 201 })
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: propertyId } = await params

  const docs = await EsignDocument.findAll({
    where: { propertyId },
    order: [['createdAt', 'DESC']],
    raw: true,
  })

  return NextResponse.json(docs)
}
