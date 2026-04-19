/**
 * GET  /api/properties/[id]/files — list files with presigned download URLs
 * POST /api/properties/[id]/files — multipart upload → MinIO + PropertyFile record
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { uploadFile, getPresignedUrl } from '@/lib/minio'
import type { FileType } from '@crm/database'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: propertyId } = await params

  const files = await prisma.propertyFile.findMany({
    where: { propertyId },
    orderBy: { createdAt: 'desc' },
  })

  // Generate presigned download URLs (5-min expiry)
  const filesWithUrls = await Promise.all(
    files.map(async (f) => {
      let downloadUrl: string | null = null
      try {
        downloadUrl = await getPresignedUrl(f.storageKey)
      } catch {
        // MinIO may not be configured in dev — return null URL
      }
      return { ...f, downloadUrl }
    }),
  )

  return NextResponse.json(filesWithUrls)
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: propertyId } = await params
  const sessionUser = (session as any)?.user ?? {}

  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } })
  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const mimeType = file.type || 'application/octet-stream'
  const originalName = file.name || 'upload'
  const ext = originalName.includes('.') ? originalName.split('.').pop() : ''
  const storageKey = `properties/${propertyId}/${Date.now()}-${originalName}`

  // Upload to MinIO (soft-fail — still create DB record as metadata even if MinIO isn't running)
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  try {
    await uploadFile(storageKey, buffer, mimeType)
  } catch (err) {
    console.warn('[files] MinIO upload failed (continuing with DB record):', err)
  }

  const fileType = inferFileType(mimeType, ext ?? '') as FileType

  const record = await prisma.propertyFile.create({
    data: {
      propertyId,
      name: originalName,
      mimeType,
      size: buffer.length,
      storageKey,
      type: fileType,
      uploadedById: sessionUser.id,
      uploadedByName: sessionUser.name ?? undefined,
    },
  })

  return NextResponse.json({ success: true, data: record }, { status: 201 })
}

function inferFileType(mimeType: string, ext: string): string {
  if (mimeType.startsWith('image/')) return 'IMAGE'
  if (mimeType === 'application/pdf' || ext === 'pdf') return 'PDF'
  if (ext === 'docx' || ext === 'doc') return 'DOCUMENT'
  if (ext === 'xlsx' || ext === 'csv') return 'SPREADSHEET'
  return 'OTHER'
}
