import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const CreateFolderSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().optional(),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const folders = await prisma.globalFolder.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { files: true } } },
  })

  return NextResponse.json(folders)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateFolderSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const folder = await prisma.globalFolder.create({
    data: {
      name: parsed.data.name,
      parentId: parsed.data.parentId ?? null,
    },
  })

  return NextResponse.json(folder, { status: 201 })
}
