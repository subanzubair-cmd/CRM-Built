/**
 * DELETE /api/properties/[id]/files/[fileId]
 *
 * Deletes a PropertyFile record and its MinIO object.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { deleteFile } from '@/lib/minio'

type Params = { params: Promise<{ id: string; fileId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: propertyId, fileId } = await params

  const file = await prisma.propertyFile.findUnique({
    where: { id: fileId },
    select: { id: true, propertyId: true, storageKey: true },
  })

  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (file.propertyId !== propertyId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Delete from MinIO (soft-fail)
  await deleteFile(file.storageKey).catch((err) => {
    console.warn('[files] MinIO delete failed (continuing):', err)
  })

  await prisma.propertyFile.delete({ where: { id: fileId } })

  return NextResponse.json({ success: true })
}
