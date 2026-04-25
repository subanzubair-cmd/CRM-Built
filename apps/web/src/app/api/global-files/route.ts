import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { GlobalFile, GlobalFolder } from '@crm/database'

const CreateFileSchema = z.object({
  name: z.string().min(1).max(255),
  url: z.string().optional(),
  size: z.number().int().optional(),
  mimeType: z.string().optional(),
  folderId: z.string().nullable().optional(),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const folderId = req.nextUrl.searchParams.get('folderId')

  const where = folderId === 'root'
    ? { folderId: null }
    : folderId
      ? { folderId }
      : {}

  const files = await GlobalFile.findAll({
    where,
    include: [{ model: GlobalFolder, as: 'folder', attributes: ['id', 'name'] }],
    order: [['createdAt', 'DESC']],
  })

  return NextResponse.json(files)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateFileSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const file = await GlobalFile.create({
    name: parsed.data.name,
    url: parsed.data.url ?? null,
    size: parsed.data.size ?? null,
    mimeType: parsed.data.mimeType ?? null,
    folderId: parsed.data.folderId ?? null,
  })

  return NextResponse.json(file, { status: 201 })
}
