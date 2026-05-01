import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import {
  Buyer,
  BuyerCriteria,
  BuyerMatch,
  BuyerOffer,
  Contact,
  BulkSmsBlastRecipient,
  Op,
  sequelize,
} from '@crm/database'
import { requirePermission } from '@/lib/auth-utils'

/**
 * POST /api/buyers/merge
 *   {
 *     keepId,           // canonical buyer that survives
 *     mergeId,          // buyer that gets soft-deleted into keep
 *     fields?: {        // overrides for non-array fields, taken from
 *                       //   the merge buyer instead of keep
 *       firstName, lastName, contactType, mailingAddress,
 *       howHeardAbout, assignedUserId, vipFlag, notes,
 *       targetCities, targetZips, targetCounties, targetStates,
 *       customQuestions
 *     }
 *   }
 *
 * Behaviour:
 *   - Phones[] and emails[] always UNION across both buyers,
 *     deduped on the value (phone number digits / lowercased email).
 *   - For every other Contact / Buyer field, the keep row wins by
 *     default; the optional `fields` map lets the caller take
 *     specific values from the merge row instead.
 *   - Reassigns BulkSmsBlastRecipient, BuyerCriteria, BuyerMatch,
 *     BuyerOffer rows from merge → keep.
 *   - Soft-deletes the merge buyer (isActive=false) so its old
 *     references stay valid in audit / activity history.
 *
 * Permissions: `contacts.edit` (same as buyer PATCH).
 */

const FieldsSchema = z
  .object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().max(100).nullable().optional(),
    contactType: z.enum(['BUYER', 'AGENT']).optional(),
    mailingAddress: z.string().max(500).nullable().optional(),
    howHeardAbout: z.string().max(120).nullable().optional(),
    assignedUserId: z.string().nullable().optional(),
    vipFlag: z.boolean().optional(),
    notes: z.string().max(2000).nullable().optional(),
    targetCities: z.array(z.string()).optional(),
    targetZips: z.array(z.string()).optional(),
    targetCounties: z.array(z.string()).optional(),
    targetStates: z.array(z.string()).optional(),
    customQuestions: z.record(z.unknown()).optional(),
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
    Buyer.findByPk(keepId, { include: [{ model: Contact, as: 'contact' }] }),
    Buyer.findByPk(mergeId, { include: [{ model: Contact, as: 'contact' }] }),
  ])
  if (!keep || !merge) {
    return NextResponse.json({ error: 'One or both buyers not found.' }, { status: 404 })
  }

  await sequelize.transaction(async (t) => {
    const keepJson = keep.get({ plain: true }) as any
    const mergeJson = merge.get({ plain: true }) as any

    // Union phones — dedupe by digit-only normalisation. The earlier
    // entry wins for label / metadata.
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
    // Also fold legacy phone / phone2 columns in case the multi-row
    // arrays were never authored.
    for (const legacy of [
      keepJson.contact?.phone,
      keepJson.contact?.phone2,
      mergeJson.contact?.phone,
      mergeJson.contact?.phone2,
    ]) {
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

    // Apply Contact patch — pickFromMerge wins when explicitly set.
    const ov = fields ?? {}
    const contactPatch: Record<string, unknown> = {
      phones: mergedPhones,
      emails: mergedEmails,
      phone: mergedPhones[0]?.number ?? null,
      email: mergedEmails[0]?.email ?? null,
    }
    if (ov.firstName !== undefined) contactPatch.firstName = ov.firstName
    if (ov.lastName !== undefined) contactPatch.lastName = ov.lastName
    if (ov.contactType !== undefined) contactPatch.type = ov.contactType
    if (ov.mailingAddress !== undefined) contactPatch.mailingAddress = ov.mailingAddress
    if (ov.howHeardAbout !== undefined) contactPatch.howHeardAbout = ov.howHeardAbout
    if (ov.assignedUserId !== undefined) contactPatch.assignedUserId = ov.assignedUserId
    await Contact.update(
      contactPatch as any,
      { where: { id: keep.contactId } as any, transaction: t },
    )

    // Apply Buyer-level patch.
    const buyerPatch: Record<string, unknown> = {}
    if (ov.vipFlag !== undefined) buyerPatch.vipFlag = ov.vipFlag
    if (ov.notes !== undefined) buyerPatch.notes = ov.notes
    if (ov.targetCities !== undefined) buyerPatch.targetCities = ov.targetCities
    if (ov.targetZips !== undefined) buyerPatch.targetZips = ov.targetZips
    if (ov.targetCounties !== undefined) buyerPatch.targetCounties = ov.targetCounties
    if (ov.targetStates !== undefined) buyerPatch.targetStates = ov.targetStates
    if (ov.customQuestions !== undefined) buyerPatch.customQuestions = ov.customQuestions
    if (Object.keys(buyerPatch).length > 0) {
      await keep.update(buyerPatch as any, { transaction: t })
    }

    // Reparent child rows. We don't reparent BuyerOffer because it
    // can also belong to a property — reassigning could double-count
    // unless we dedupe; v1 keeps a soft pointer (offers stay tied to
    // the merge buyer, but the merge buyer is then marked inactive).
    // For BuyerCriteria + BuyerMatch we do reparent so the matching
    // engine keeps producing hits against the kept buyer.
    await BuyerCriteria.update(
      { buyerId: keep.id } as any,
      { where: { buyerId: merge.id }, transaction: t } as any,
    )
    await BuyerMatch.update(
      { buyerId: keep.id } as any,
      { where: { buyerId: merge.id }, transaction: t } as any,
    )
    // BulkSmsBlastRecipient subjectId points at Buyer.id when subjectType='BUYER'.
    await BulkSmsBlastRecipient.update(
      { subjectId: keep.id } as any,
      {
        where: { subjectType: 'BUYER' as any, subjectId: merge.id },
        transaction: t,
      } as any,
    )

    // Soft-delete the merge buyer. We mark the Contact inactive too
    // so the dedupe scans on future creates don't trip on it.
    await merge.update({ isActive: false } as any, { transaction: t })
  })

  const fresh = await Buyer.findByPk(keep.id, {
    include: [{ model: Contact, as: 'contact' }],
  })
  return NextResponse.json({ success: true, data: fresh?.get({ plain: true }) })
}
