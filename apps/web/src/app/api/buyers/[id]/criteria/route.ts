import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const CreateCriteriaSchema = z.object({
  markets: z.array(z.string()).default([]),
  propertyTypes: z.array(z.string()).default([]),
  minBeds: z.number().int().min(0).optional(),
  maxBeds: z.number().int().min(0).optional(),
  minBaths: z.number().min(0).optional(),
  maxBaths: z.number().min(0).optional(),
  minPrice: z.number().min(0).optional(),
  maxPrice: z.number().min(0).optional(),
  minSqft: z.number().int().min(0).optional(),
  maxSqft: z.number().int().min(0).optional(),
  minArv: z.number().min(0).optional(),
  maxArv: z.number().min(0).optional(),
  maxRepairs: z.number().min(0).optional(),
  notes: z.string().max(2000).optional(),
})

const DeleteCriteriaSchema = z.object({
  criteriaId: z.string().min(1),
})

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = CreateCriteriaSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const criteria = await prisma.buyerCriteria.create({
    data: {
      buyerId: id,
      ...parsed.data,
    },
  })

  return NextResponse.json({ success: true, data: criteria }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: _buyerId } = await params
  const body = await req.json()
  const parsed = DeleteCriteriaSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  await prisma.buyerCriteria.delete({ where: { id: parsed.data.criteriaId } })

  return NextResponse.json({ success: true })
}
