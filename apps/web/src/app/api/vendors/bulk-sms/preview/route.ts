import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { Vendor, Contact, Op } from '@crm/database'
import { requirePermission } from '@/lib/auth-utils'
import { resolveVendorRecipients, type VendorFilterParams } from '@/lib/vendor-filter'

/**
 * POST /api/vendors/bulk-sms/preview
 *
 * Mirrors the buyers preview route — counts vendors that would
 * actually receive an SMS (after DND + dedupe + missing-phone
 * exclusion) so the operator's count matches what the worker fires.
 */
const Schema = z.object({
  buyerIds: z.array(z.string()).optional(), // alias for vendorIds (UI calls it buyerIds)
  filter: z.record(z.unknown()).optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'vendors.view')
  if (deny) return deny

  const parsed = Schema.safeParse(await req.json())
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const recipients = await resolveVendorRecipients({
    vendorIds: parsed.data.buyerIds ?? [],
    filter: (parsed.data.filter as VendorFilterParams | undefined) ?? null,
  })

  const sampleIds = recipients.slice(0, 5).map((r) => r.subjectId)
  const sample =
    sampleIds.length > 0
      ? ((
          await Vendor.findAll({
            where: { id: { [Op.in]: sampleIds } } as any,
            include: [
              { model: Contact, as: 'contact', attributes: ['firstName', 'lastName'] },
            ],
            attributes: ['id'],
          })
        ).map((v) => {
          const j = v.get({ plain: true }) as any
          return {
            id: j.id,
            name: [j.contact?.firstName, j.contact?.lastName].filter(Boolean).join(' '),
          }
        }))
      : []

  return NextResponse.json({ count: recipients.length, sample })
}
