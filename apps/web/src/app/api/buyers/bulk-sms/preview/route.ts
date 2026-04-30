import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { Buyer, Contact, Op } from '@crm/database'
import { requirePermission } from '@/lib/auth-utils'
import { resolveBuyerRecipients, type BuyerFilterParams } from '@/lib/buyer-filter'

/**
 * POST /api/buyers/bulk-sms/preview
 *
 * Powers the Bulk SMS confirmation step ("You have selected X
 * records to send the bulk SMS"). Counts buyers that would actually
 * receive an SMS (after DND + dedupe + missing-phone exclusion),
 * not the raw selection — so the operator's count matches what the
 * worker will actually send.
 */
const Schema = z.object({
  buyerIds: z.array(z.string()).optional(),
  filter: z.record(z.unknown()).optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'buyers.view')
  if (deny) return deny

  const parsed = Schema.safeParse(await req.json())
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const recipients = await resolveBuyerRecipients({
    buyerIds: parsed.data.buyerIds ?? [],
    filter: (parsed.data.filter as BuyerFilterParams | undefined) ?? null,
  })

  // Lightweight sample for the confirmation UI: first 5 names so
  // the operator can sanity-check who the SMS is going to.
  const sampleIds = recipients.slice(0, 5).map((r) => r.subjectId)
  const sample =
    sampleIds.length > 0
      ? ((await Buyer.findAll({
          where: { id: { [Op.in]: sampleIds } } as any,
          include: [
            { model: Contact, as: 'contact', attributes: ['firstName', 'lastName'] },
          ],
          attributes: ['id'],
        })).map((b) => {
          const j = b.get({ plain: true }) as any
          return {
            id: j.id,
            name: [j.contact?.firstName, j.contact?.lastName].filter(Boolean).join(' '),
          }
        }))
      : []

  return NextResponse.json({ count: recipients.length, sample })
}
