import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const UpdateCampaignSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']).optional(),
  description: z.string().optional(),
  marketId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  leadTypes: z.array(z.enum(['DIRECT_TO_SELLER', 'DIRECT_TO_AGENT'])).optional(),
  aiEnabled: z.boolean().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateCampaignSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const campaign = await prisma.campaign.update({ where: { id }, data: parsed.data })
  return NextResponse.json(campaign)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await prisma.campaign.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
