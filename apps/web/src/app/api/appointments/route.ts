import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'
import { enqueueCalendarSync } from '@/lib/queue'
import { z } from 'zod'

const CreateAppointmentSchema = z.object({
  propertyId: z.string().min(1),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  location: z.string().optional(),
  attendees: z.array(z.string()).default([]),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'leads.view')
  if (deny) return deny

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const where = {
    ...(from || to
      ? {
          startAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {
          startAt: { gte: new Date() },
        }),
  }

  const appointments = await prisma.appointment.findMany({
    where,
    include: {
      property: {
        select: {
          id: true,
          streetAddress: true,
          city: true,
          state: true,
          leadType: true,
          propertyStatus: true,
        },
      },
    },
    orderBy: { startAt: 'asc' },
    take: 500,
  })

  return NextResponse.json({ data: appointments })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'leads.edit')
  if (deny) return deny

  const body = await req.json()
  const parsed = CreateAppointmentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const appointment = await prisma.appointment.create({
    data: {
      ...parsed.data,
      startAt: new Date(parsed.data.startAt),
      endAt: new Date(parsed.data.endAt),
    },
  })

  await enqueueCalendarSync({ action: 'create', appointmentId: appointment.id })

  return NextResponse.json({ success: true, data: appointment }, { status: 201 })
}
