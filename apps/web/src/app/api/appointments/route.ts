import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { Appointment, Property, Op } from '@crm/database'
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

  const where: Record<string, any> = {}
  if (from || to) {
    const range: Record<symbol, Date> = {}
    if (from) range[Op.gte] = new Date(from)
    if (to) range[Op.lte] = new Date(to)
    where.startAt = range
  } else {
    where.startAt = { [Op.gte]: new Date() }
  }

  const appointments = await Appointment.findAll({
    where,
    include: [
      {
        model: Property,
        as: 'property',
        attributes: [
          'id',
          'streetAddress',
          'city',
          'state',
          'leadType',
          'propertyStatus',
        ],
      },
    ],
    order: [['startAt', 'ASC']],
    limit: 500,
    raw: true,
    nest: true,
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

  const appointment = await Appointment.create({
    propertyId: parsed.data.propertyId,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    startAt: new Date(parsed.data.startAt),
    endAt: new Date(parsed.data.endAt),
    location: parsed.data.location ?? null,
    attendees: parsed.data.attendees,
  })

  await enqueueCalendarSync({ action: 'create', appointmentId: appointment.id })

  return NextResponse.json({ success: true, data: appointment }, { status: 201 })
}
