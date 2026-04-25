import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { GlobalFolder, literal } from '@crm/database'

const CreateFolderSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().optional(),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Equivalent of Prisma's `_count: { select: { files: true } }`. We add a
  // computed integer column via a subquery so we don't pull every file row.
  const folders = await GlobalFolder.findAll({
    order: [['name', 'ASC']],
    attributes: {
      include: [
        [
          literal(
            `(SELECT COUNT(*)::int FROM "GlobalFile" gf WHERE gf."folderId" = "GlobalFolder"."id")`,
          ),
          'fileCount',
        ],
      ],
    },
  })

  // Match the original response shape: `_count: { files: <n> }` so the
  // frontend doesn't need to change.
  const shaped = folders.map((f) => {
    const json = f.toJSON() as any
    return {
      ...json,
      _count: { files: Number(json.fileCount ?? 0) },
    }
  })

  return NextResponse.json(shaped)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateFolderSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const folder = await GlobalFolder.create({
    name: parsed.data.name,
    parentId: parsed.data.parentId ?? null,
  })

  return NextResponse.json(folder, { status: 201 })
}
