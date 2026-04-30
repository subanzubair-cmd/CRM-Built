import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  BulkSmsBlast,
  BulkSmsBlastRecipient,
  Buyer,
  Contact,
  Op,
} from '@crm/database'
import { requirePermission } from '@/lib/auth-utils'

/**
 * /api/buyers/bulk-sms/[id]
 *   GET    blast detail + paginated per-recipient delivery rows
 *   DELETE cancel a not-yet-completed blast
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const deny = requirePermission(session, 'buyers.view')
  if (deny) return deny

  const { id } = await params
  const sp = req.nextUrl.searchParams
  const page = parseInt(sp.get('page') ?? '1', 10)
  const pageSize = Math.min(200, parseInt(sp.get('pageSize') ?? '50', 10))
  const status = sp.get('status') // optional filter on recipient.status

  const blast = await BulkSmsBlast.findByPk(id)
  if (!blast) return NextResponse.json({ error: 'Blast not found' }, { status: 404 })

  const recipientWhere: Record<string, unknown> = { blastId: id }
  if (status) recipientWhere.status = status

  const [rows, total] = await Promise.all([
    BulkSmsBlastRecipient.findAll({
      where: recipientWhere,
      order: [['createdAt', 'ASC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    BulkSmsBlastRecipient.count({ where: recipientWhere }),
  ])

  // Hydrate display names for the BUYER subject rows so the per-row
  // table can render "Logan Chau · (214) 519-1653" instead of an
  // opaque subjectId.
  const buyerIds = rows
    .filter((r) => (r.get('subjectType') as string) === 'BUYER')
    .map((r) => r.get('subjectId') as string)
  const buyers =
    buyerIds.length > 0
      ? await Buyer.findAll({
          where: { id: { [Op.in]: buyerIds } } as any,
          attributes: ['id'],
          include: [
            {
              model: Contact,
              as: 'contact',
              attributes: ['firstName', 'lastName', 'email'],
            },
          ],
        })
      : []
  const buyerById = new Map(
    buyers.map((b) => {
      const j = b.get({ plain: true }) as any
      return [j.id, j.contact ?? {}]
    }),
  )

  const recipientRows = rows.map((r) => {
    const j = r.get({ plain: true }) as any
    const c = (j.subjectType === 'BUYER' && buyerById.get(j.subjectId)) || {}
    return {
      ...j,
      contact: { firstName: c.firstName ?? null, lastName: c.lastName ?? null },
    }
  })

  return NextResponse.json({
    blast: blast.get({ plain: true }),
    recipients: { rows: recipientRows, total },
  })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const deny = requirePermission(session, 'buyers.bulk_sms')
  if (deny) return deny

  const { id } = await params
  const blast = await BulkSmsBlast.findByPk(id)
  if (!blast) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if ((blast.get('status') as string) === 'COMPLETED') {
    return NextResponse.json(
      { error: 'Already completed; cannot cancel.' },
      { status: 422 },
    )
  }

  await blast.update({ status: 'CANCELLED', completedAt: new Date() } as any)
  // Mark all still-queued recipients as SKIPPED_INVALID — they
  // won't get processed by the worker (which already short-circuits
  // on parent.status='CANCELLED'), but flipping their status here
  // keeps the per-row table accurate without a worker pass.
  await BulkSmsBlastRecipient.update(
    { status: 'SKIPPED_INVALID' as any, failReason: 'Blast cancelled' } as any,
    { where: { blastId: id, status: 'QUEUED' as any } } as any,
  )
  return new NextResponse(null, { status: 204 })
}
