import { Appointment, Property, Op } from '@crm/database'
import type { WhereOptions } from '@crm/database'

export interface AppointmentListFilter {
  propertyId?: string
  from?: Date
  to?: Date
  page?: number
  pageSize?: number
}

export async function getAppointmentList(filter: AppointmentListFilter) {
  const { propertyId, from, to, page = 1, pageSize = 50 } = filter

  const where: WhereOptions = {}

  // When viewing a specific property's appointments, show all (past + future)
  // so users can record outcomes. Global calendar view still filters to upcoming.
  if (!propertyId) {
    const now = new Date()
    const startAtFilter: Record<symbol, Date> = {}
    startAtFilter[Op.gte] = from ?? now
    if (to) startAtFilter[Op.lte] = to
    ;(where as any).startAt = startAtFilter
  } else if (from || to) {
    const startAtFilter: Record<symbol, Date> = {}
    if (from) startAtFilter[Op.gte] = from
    if (to) startAtFilter[Op.lte] = to
    ;(where as any).startAt = startAtFilter
  }

  if (propertyId) (where as any).propertyId = propertyId

  const [rows, total] = await Promise.all([
    Appointment.findAll({
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
      offset: (page - 1) * pageSize,
      limit: pageSize,
      raw: true,
      nest: true,
    }),
    Appointment.count({ where }),
  ])

  return { rows, total, page, pageSize }
}
