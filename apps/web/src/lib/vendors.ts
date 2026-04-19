import { prisma } from '@/lib/prisma'
import { Prisma } from '@crm/database'

export interface VendorListFilter {
  search?: string
  category?: string
  activeOnly?: boolean
  page?: number
  pageSize?: number
}

export async function getVendorList(filter: VendorListFilter) {
  const { search, category, activeOnly, page = 1, pageSize = 50 } = filter

  const where: Prisma.VendorWhereInput = {
    ...(activeOnly && { isActive: true }),
    ...(category && { category }),
    ...(search && {
      contact: {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
        ],
      },
    }),
  }

  const [rows, total] = await Promise.all([
    prisma.vendor.findMany({
      where,
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.vendor.count({ where }),
  ])

  return { rows, total, page, pageSize }
}

export async function getVendorById(id: string) {
  return prisma.vendor.findUnique({
    where: { id },
    include: {
      contact: true,
    },
  })
}
