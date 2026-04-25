import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ListStackSource } from '@crm/database'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const row = await ListStackSource.findByPk(id)
  if (!row) return new NextResponse(null, { status: 204 })
  await row.destroy()
  return new NextResponse(null, { status: 204 })
}
