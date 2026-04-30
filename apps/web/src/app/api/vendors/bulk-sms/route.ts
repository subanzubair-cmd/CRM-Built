import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import {
  BulkSmsBlast,
  BulkSmsBlastRecipient,
  Vendor,
  Contact,
  Op,
  sequelize,
} from '@crm/database'
import { requirePermission } from '@/lib/auth-utils'
import { enqueueBulkSmsRecipient } from '@/lib/queue'
import { resolveVendorRecipients, type VendorFilterParams } from '@/lib/vendor-filter'

/**
 * /api/buyers/bulk-sms
 *   GET   list past blasts (paginated)
 *   POST  create a new blast: snapshot the filter, materialise
 *         recipient rows, enqueue per-recipient jobs.
 *
 * Permissions:
 *   GET  → buyers.view
 *   POST → buyers.bulk_sms (separate from buyers.manage so a comms
 *           operator can be granted send rights without buyer-edit).
 */

const PostSchema = z.object({
  name: z.string().min(1).max(200),
  body: z.string().min(1).max(1600),
  fromPhoneNumberId: z.string().min(1),
  /**
   * Either pre-selected buyerIds OR a SavedFilter snapshot. The
   * front-end's "Send Bulk SMS" flow uses buyerIds when the operator
   * has manually checked records; the SavedFilter snapshot is used
   * when the operator chose "Select All" matching the active filter.
   */
  buyerIds: z.array(z.string()).optional(), // accepted as alias for vendorIds
  filter: z.record(z.unknown()).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'vendors.view')
  if (deny) return deny

  const sp = req.nextUrl.searchParams
  const page = parseInt(sp.get('page') ?? '1', 10)
  const pageSize = Math.min(100, parseInt(sp.get('pageSize') ?? '25', 10))

  const [rows, total] = await Promise.all([
    BulkSmsBlast.findAll({
      where: { module: 'VENDORS' as any },
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    BulkSmsBlast.count({ where: { module: 'VENDORS' as any } }),
  ])
  return NextResponse.json({ rows, total })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'vendors.bulk_sms')
  if (deny) return deny

  const body = await req.json()
  const parsed = PostSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }
  const { name, body: smsBody, fromPhoneNumberId, buyerIds, filter, scheduledAt } = parsed.data

  if (!buyerIds?.length && !filter) {
    return NextResponse.json(
      { error: 'Provide vendorIds or filter to choose recipients' },
      { status: 422 },
    )
  }

  const recipients = await resolveVendorRecipients({
    vendorIds: buyerIds ?? [],
    filter: (filter as VendorFilterParams | undefined) ?? null,
  })

  if (recipients.length === 0) {
    return NextResponse.json(
      { error: 'No reachable vendors matched. Check filter / phone numbers.' },
      { status: 422 },
    )
  }

  const userId = (session?.user as any)?.id as string | undefined

  // Materialise the blast + recipient rows in a single transaction so
  // a worker can never start firing for a half-written batch.
  const blast = await sequelize.transaction(async (t) => {
    const created = await BulkSmsBlast.create(
      {
        module: 'VENDORS' as any,
        name,
        body: smsBody,
        fromPhoneNumberId,
        createdById: userId ?? null,
        recipientFilterSnapshot: (filter as Record<string, unknown>) ?? {},
        recipientCount: recipients.length,
        sentCount: 0,
        deliveredCount: 0,
        failedCount: 0,
        status: scheduledAt ? 'QUEUED' : 'SENDING',
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        startedAt: scheduledAt ? null : new Date(),
      } as any,
      { transaction: t },
    )

    await BulkSmsBlastRecipient.bulkCreate(
      recipients.map((r) => ({
        blastId: created.id,
        subjectType: r.subjectType,
        subjectId: r.subjectId,
        phone: r.phone,
        status: 'QUEUED' as any,
      })) as any[],
      { transaction: t },
    )
    return created
  })

  // Now enqueue jobs (best-effort — failures here mean some
  // recipients won't fire, which we recover via the periodic
  // sweep. NOT inside the transaction because BullMQ uses Redis,
  // not Postgres.)
  if (!scheduledAt) {
    const recipientRows = await BulkSmsBlastRecipient.findAll({
      where: { blastId: blast.id, status: 'QUEUED' as any },
      attributes: ['id'],
      raw: true,
    })
    for (const row of recipientRows as Array<{ id: string }>) {
      try {
        await enqueueBulkSmsRecipient(row.id)
      } catch (err) {
        console.warn('[bulk-sms] enqueue failed (non-fatal):', err)
      }
    }
  }

  return NextResponse.json(blast, { status: 201 })
}
