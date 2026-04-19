import { prisma } from '@/lib/prisma'
import { Prisma } from '@crm/database'

export interface AppointmentListFilter {
  propertyId?: string
  from?: Date
  to?: Date
  page?: number
  pageSize?: number
}

export async function getAppointmentList(filter: AppointmentListFilter) {
  const { propertyId, from, to, page = 1, pageSize = 50 } = filter

  const now = new Date()

  const where: Prisma.AppointmentWhereInput = {
    startAt: {
      gte: from ?? now,
      ...(to && { lte: to }),
    },
    ...(propertyId && { propertyId }),
  }

  const [rows, total] = await Promise.all([
    prisma.appointment.findMany({
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
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.appointment.count({ where }),
  ])

  return { rows, total, page, pageSize }
}
