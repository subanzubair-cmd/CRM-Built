import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    contact: { create: vi.fn(), update: vi.fn() },
    propertyContact: {
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { addContactToProperty, removeContactFromProperty } from '../contacts'

describe('addContactToProperty', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates contact and link without unsetting primary when isPrimary=false', async () => {
    vi.mocked(prisma.contact.create).mockResolvedValue({
      id: 'c1', firstName: 'John', lastName: 'Smith', type: 'SELLER',
    } as any)
    vi.mocked(prisma.propertyContact.create).mockResolvedValue({
      id: 'pc1', propertyId: 'p1', contactId: 'c1', isPrimary: false,
    } as any)

    const result = await addContactToProperty('p1', { firstName: 'John', isPrimary: false })

    expect(prisma.contact.create).toHaveBeenCalledOnce()
    expect(prisma.propertyContact.updateMany).not.toHaveBeenCalled()
    expect(result.contact.id).toBe('c1')
  })

  it('unsets other primary contacts when isPrimary=true', async () => {
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: 'c2', firstName: 'Jane', type: 'SELLER' } as any)
    vi.mocked(prisma.propertyContact.create).mockResolvedValue({ id: 'pc2' } as any)
    vi.mocked(prisma.propertyContact.updateMany).mockResolvedValue({ count: 1 } as any)

    await addContactToProperty('p1', { firstName: 'Jane', isPrimary: true })

    expect(prisma.propertyContact.updateMany).toHaveBeenCalledWith({
      where: { propertyId: 'p1', isPrimary: true },
      data: { isPrimary: false },
    })
  })
})

describe('removeContactFromProperty', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes the property-contact link by propertyId and contactId', async () => {
    vi.mocked(prisma.propertyContact.deleteMany).mockResolvedValue({ count: 1 } as any)

    await removeContactFromProperty('p1', 'c1')

    expect(prisma.propertyContact.deleteMany).toHaveBeenCalledWith({
      where: { propertyId: 'p1', contactId: 'c1' },
    })
  })
})
