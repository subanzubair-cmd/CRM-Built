import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { GlobalFile } from '@crm/database'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const file = await GlobalFile.findByPk(id)
  if (!file) return new NextResponse(null, { status: 204 })
  await file.destroy()

  return new NextResponse(null, { status: 204 })
}
