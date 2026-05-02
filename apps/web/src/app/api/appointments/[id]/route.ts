import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Appointment, Property } from '@crm/database'
import { enqueueCalendarSync } from '@/lib/queue'
import { z } from 'zod'

const UpdateAppointmentSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  location: z.string().optional(),
  attendees: z.array(z.string()).optional(),
  outcome: z.enum(['KEPT', 'NOT_KEPT']).optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateAppointmentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const updates: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.startAt) updates.startAt = new Date(parsed.data.startAt)
  if (parsed.data.endAt) updates.endAt = new Date(parsed.data.endAt)

  const appointment = await Appointment.findByPk(id)
  if (!appointment) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await appointment.update(updates)

  // Auto-qualify the lead when appointment outcome is KEPT
  if (parsed.data.outcome === 'KEPT' && appointment.propertyId) {
    await Property.update(
      { isQualified: true } as any,
      { where: { id: appointment.propertyId } },
    )
  }

  await enqueueCalendarSync({ action: 'update', appointmentId: appointment.id })

  return NextResponse.json({ success: true, data: appointment })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const existing = await Appointment.findByPk(id, {
    attributes: ['id', 'googleEventId'],
  })

  await Appointment.destroy({ where: { id } })

  if (existing?.googleEventId) {
    await enqueueCalendarSync({
      action: 'delete',
      appointmentId: id,
      googleEventId: existing.googleEventId,
    })
  }

  return NextResponse.json({ success: true })
}
