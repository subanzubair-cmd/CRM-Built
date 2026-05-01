import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { z } from 'zod'
import {
  Buyer,
  Contact,
  Property,
  PropertyContact,
  StageHistory,
  ActivityLog,
  Vendor,
  Op,
  sequelize,
} from '@crm/database'

/**
 * POST /api/contacts/convert
 *
 * Converts a buyer/vendor into a different entity type:
 *   - buyer  -> vendor | lead
 *   - vendor -> buyer  | lead
 *
 * For buyer <-> vendor: creates the target entity linked to the same
 * Contact (with type updated), soft-deletes the source entity.
 *
 * For -> lead: creates a Property record + PropertyContact. Requires
 * pipeline (DTS / DTA) selection. Property address is optional but
 * the modal asks for it.
 */

const Schema = z.object({
  /** The source entity type. */
  from: z.enum(['buyer', 'vendor']),
  /** The source entity id (Buyer.id or Vendor.id). */
  sourceId: z.string().min(1),
  /** The target entity type. */
  to: z.enum(['buyer', 'vendor', 'lead']),

  // Required when target is 'lead':
  pipeline: z.enum(['DTS', 'DTA']).optional(),
  streetAddress: z.string().max(500).optional(),
  city: z.string().max(200).optional(),
  state: z.string().max(50).optional(),
  zip: z.string().max(20).optional(),

  // Required when target is 'vendor':
  category: z.string().max(100).optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'contacts.edit')
  if (deny) return deny

  const parsed = Schema.safeParse(await req.json())
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { from, sourceId, to, pipeline, streetAddress, city, state, zip, category } = parsed.data
  const userId = (session as any)?.user?.id ?? 'system'

  if (from === to) {
    return NextResponse.json({ error: 'Source and target types must differ.' }, { status: 422 })
  }

  // Validate 'lead' conversions require a pipeline.
  if (to === 'lead' && !pipeline) {
    return NextResponse.json(
      { error: 'Pipeline (DTS or DTA) is required when converting to a lead.' },
      { status: 422 },
    )
  }

  // Load source entity + contact.
  let contactId: string
  let sourceEntity: any

  if (from === 'buyer') {
    sourceEntity = await Buyer.findByPk(sourceId, {
      include: [{ model: Contact, as: 'contact' }],
    })
  } else {
    sourceEntity = await Vendor.findByPk(sourceId, {
      include: [{ model: Contact, as: 'contact' }],
    })
  }

  if (!sourceEntity) {
    return NextResponse.json({ error: `${from} not found.` }, { status: 404 })
  }
  contactId = sourceEntity.contactId as string
  const contact = (sourceEntity as any).contact

  const result = await sequelize.transaction(async (t) => {
    // ── buyer / vendor -> buyer / vendor ─────────────────────────
    if (to === 'buyer') {
      // Check if this contact already has a Buyer row.
      const existing = await Buyer.findOne({
        where: { contactId } as any,
        transaction: t,
      })
      if (existing) {
        return { type: 'buyer' as const, id: existing.id, alreadyExists: true }
      }

      // Change contact type
      await Contact.update(
        { type: 'BUYER' } as any,
        { where: { id: contactId }, transaction: t } as any,
      )

      // Create Buyer row
      const buyer = await Buyer.create(
        {
          contactId,
          notes: sourceEntity.notes ?? null,
        } as any,
        { transaction: t },
      )

      // Soft-delete source
      await sourceEntity.update({ isActive: false }, { transaction: t })

      return { type: 'buyer' as const, id: buyer.id }
    }

    if (to === 'vendor') {
      // Check if this contact already has a Vendor row.
      const existing = await Vendor.findOne({
        where: { contactId } as any,
        transaction: t,
      })
      if (existing) {
        return { type: 'vendor' as const, id: existing.id, alreadyExists: true }
      }

      // Change contact type
      await Contact.update(
        { type: 'VENDOR' } as any,
        { where: { id: contactId }, transaction: t } as any,
      )

      // Create Vendor row
      const vendor = await Vendor.create(
        {
          contactId,
          category: category ?? 'Other',
          notes: sourceEntity.notes ?? null,
        } as any,
        { transaction: t },
      )

      // Soft-delete source
      await sourceEntity.update({ isActive: false }, { transaction: t })

      return { type: 'vendor' as const, id: vendor.id }
    }

    // ── buyer / vendor -> lead ───────────────────────────────────
    if (to === 'lead') {
      const leadType = pipeline === 'DTA' ? 'DIRECT_TO_AGENT' : 'DIRECT_TO_SELLER'
      const contactType = pipeline === 'DTA' ? 'AGENT' : 'SELLER'

      // Build normalised address for dedupe.
      const addrParts = [streetAddress, city, state, zip].filter(Boolean)
      const normalizedAddress = addrParts.join(' ').toLowerCase().replace(/[^a-z0-9]/g, '')

      // Create Property
      const property = await Property.create(
        {
          propertyStatus: 'LEAD',
          leadType,
          leadStatus: 'ACTIVE',
          activeLeadStage: 'NEW_LEAD',
          streetAddress: streetAddress || null,
          city: city || null,
          state: state || null,
          zip: zip || null,
          normalizedAddress: normalizedAddress || null,
          source: `Converted from ${from}`,
          createdById: userId,
          assignedToId: userId,
        } as any,
        { transaction: t },
      )

      // Update contact type to match the lead pipeline.
      await Contact.update(
        { type: contactType } as any,
        { where: { id: contactId }, transaction: t } as any,
      )

      // Link contact to property.
      await PropertyContact.create(
        {
          propertyId: property.id,
          contactId,
          isPrimary: true,
        } as any,
        { transaction: t },
      )

      // Stage history
      await StageHistory.create(
        {
          propertyId: property.id,
          field: 'activeLeadStage',
          oldValue: null,
          newValue: 'NEW_LEAD',
          changedById: userId,
        } as any,
        { transaction: t },
      )

      // Activity log
      await ActivityLog.create(
        {
          propertyId: property.id,
          userId,
          action: 'LEAD_CREATED',
          detail: { description: `Lead created from ${from} conversion` },
        } as any,
        { transaction: t },
      )

      // Generate lead number.
      const now = new Date()
      const yyyy = now.getFullYear()
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      const startOfMonth = new Date(yyyy, now.getMonth(), 1)
      const countThisMonth = await Property.count({
        where: { createdAt: { [Op.gte]: startOfMonth } },
        transaction: t,
      })
      const leadNumber = `HP-${yyyy}${mm}-${String(countThisMonth).padStart(4, '0')}`
      await property.update({ leadNumber }, { transaction: t })

      // Soft-delete source entity.
      await sourceEntity.update({ isActive: false }, { transaction: t })

      return { type: 'lead' as const, id: property.id }
    }

    throw new Error('Invalid target type.')
  })

  // Build redirect URL.
  let redirectUrl = '/'
  if (result.type === 'buyer') redirectUrl = `/buyers/${result.id}`
  else if (result.type === 'vendor') redirectUrl = `/vendors/${result.id}`
  else if (result.type === 'lead') redirectUrl = `/leads/${result.id}`

  return NextResponse.json({
    success: true,
    data: result,
    redirectUrl,
    ...(result.alreadyExists
      ? { warning: `This contact already has a ${result.type} record. Redirecting to it.` }
      : {}),
  })
}
