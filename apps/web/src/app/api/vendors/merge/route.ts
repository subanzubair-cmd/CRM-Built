import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import {
  Vendor,
  Contact,
  BulkSmsBlastRecipient,
  Op,
  sequelize,
} from '@crm/database'
import { requirePermission } from '@/lib/auth-utils'

/**
 * POST /api/vendors/merge
 *   {
 *     keepId,           // canonical vendor that survives
 *     mergeId,          // vendor that gets soft-deleted into keep
 *     fields?: {        // overrides for non-array fields
 *       firstName, lastName, category, markets, notes, isActive
 *     }
 *   }
 *
 * Behaviour:
 *   - Phones[] and emails[] always UNION across both vendors,
 *     deduped on the value (phone number digits / lowercased email).
 *   - For every other Contact / Vendor field, the keep row wins by
 *     default; the optional `fields` map overrides specific values.
 *   - Reassigns BulkSmsBlastRecipient rows from merge -> keep.
 *   - Soft-deletes the merge vendor (isActive=false).
 */

const FieldsSchema = z
  .object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().max(100).nullable().optional(),
    category: z.string().min(1).max(100).optional(),
    markets: z.array(z.string()).optional(),
    notes: z.string().max(2000).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .partial()

const Schema = z.object({
  keepId: z.string().min(1),
  mergeId: z.string().min(1),
  fields: FieldsSchema.optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'contacts.edit')
  if (deny) return deny

  const parsed = Schema.safeParse(await req.json())
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  const { keepId, mergeId, fields } = parsed.data

  if (keepId === mergeId) {
    return NextResponse.json(
      { error: 'keepId and mergeId must differ.' },
      { status: 422 },
    )
  }

  const [keep, merge] = await Promise.all([
    Vendor.findByPk(keepId, { include: [{ model: Contact, as: 'contact' }] }),
    Vendor.findByPk(mergeId, { include: [{ model: Contact, as: 'contact' }] }),
  ])
  if (!keep || !merge) {
    return NextResponse.json({ error: 'One or both vendors not found.' }, { status: 404 })
  }

  await sequelize.transaction(async (t) => {
    const keepJson = keep.get({ plain: true }) as any
    const mergeJson = merge.get({ plain: true }) as any

    // Union phones — dedupe by digit-only normalisation.
    const phoneSeen = new Set<string>()
    const mergedPhones: Array<{ label: string; number: string }> = []
    for (const src of [keepJson.contact?.phones, mergeJson.contact?.phones]) {
      if (!Array.isArray(src)) continue
      for (const p of src) {
        const key = String(p?.number ?? '').replace(/\D/g, '')
        if (!key || phoneSeen.has(key)) continue
        phoneSeen.add(key)
        mergedPhones.push({ label: String(p.label ?? 'Other'), number: String(p.number) })
      }
    }
    // Fold legacy phone columns.
    for (const legacy of [keepJson.contact?.phone, mergeJson.contact?.phone]) {
      if (!legacy) continue
      const key = String(legacy).replace(/\D/g, '')
      if (!key || phoneSeen.has(key)) continue
      phoneSeen.add(key)
      mergedPhones.push({ label: 'Other', number: String(legacy) })
    }

    // Union emails — dedupe by lowercase.
    const emailSeen = new Set<string>()
    const mergedEmails: Array<{ label: string; email: string }> = []
    for (const src of [keepJson.contact?.emails, mergeJson.contact?.emails]) {
      if (!Array.isArray(src)) continue
      for (const e of src) {
        const key = String(e?.email ?? '').toLowerCase()
        if (!key || emailSeen.has(key)) continue
        emailSeen.add(key)
        mergedEmails.push({ label: String(e.label ?? 'Other'), email: String(e.email) })
      }
    }
    for (const legacy of [keepJson.contact?.email, mergeJson.contact?.email]) {
      if (!legacy) continue
      const key = String(legacy).toLowerCase()
      if (!key || emailSeen.has(key)) continue
      emailSeen.add(key)
      mergedEmails.push({ label: 'Other', email: String(legacy) })
    }

    // Apply Contact patch.
    const ov = fields ?? {}
    const contactPatch: Record<string, unknown> = {
      phones: mergedPhones,
      emails: mergedEmails,
      phone: mergedPhones[0]?.number ?? null,
      email: mergedEmails[0]?.email ?? null,
    }
    if (ov.firstName !== undefined) contactPatch.firstName = ov.firstName
    if (ov.lastName !== undefined) contactPatch.lastName = ov.lastName
    await Contact.update(
      contactPatch as any,
      { where: { id: keep.contactId } as any, transaction: t },
    )

    // Apply Vendor-level patch.
    const vendorPatch: Record<string, unknown> = {}
    if (ov.category !== undefined) vendorPatch.category = ov.category
    if (ov.markets !== undefined) vendorPatch.markets = ov.markets
    if (ov.notes !== undefined) vendorPatch.notes = ov.notes
    if (ov.isActive !== undefined) vendorPatch.isActive = ov.isActive
    if (Object.keys(vendorPatch).length > 0) {
      await keep.update(vendorPatch as any, { transaction: t })
    }

    // Reparent BulkSmsBlastRecipient rows where subjectType='VENDOR'.
    await BulkSmsBlastRecipient.update(
      { subjectId: keep.id } as any,
      {
        where: { subjectType: 'VENDOR' as any, subjectId: merge.id },
        transaction: t,
      } as any,
    )

    // Soft-delete the merge vendor.
    await merge.update({ isActive: false } as any, { transaction: t })
  })

  const fresh = await Vendor.findByPk(keep.id, {
    include: [{ model: Contact, as: 'contact' }],
  })
  return NextResponse.json({ success: true, data: fresh?.get({ plain: true }) })
}
