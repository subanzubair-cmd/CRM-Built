/**
 * Bulk SMS Blast detail page — drilled into from the SMS Campaign
 * tab on /buyers. Shows the blast header (name, body, status,
 * counts) plus a per-recipient delivery table with status filter.
 *
 * Lives under /buyers because a blast is module-scoped (BUYERS).
 * The same shape will be reused for /vendors/sms-campaigns/[id]
 * once the Vendor module is replicated in Phase I.
 */

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import {
  BulkSmsBlast,
  BulkSmsBlastRecipient,
  Buyer,
  Contact,
  Op,
} from '@crm/database'
import { BlastDetailClient } from '@/components/buyers/BlastDetailClient'

interface PageProps {
  params: Promise<{ id: string }>
}

export const metadata = { title: 'Bulk SMS Blast' }

export default async function BlastDetailPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const blast = await BulkSmsBlast.findByPk(id)
  if (!blast) notFound()
  const blastJson = blast.get({ plain: true }) as any

  const recipientRows = await BulkSmsBlastRecipient.findAll({
    where: { blastId: id },
    order: [['createdAt', 'ASC']],
    limit: 500,
  })

  const buyerIds = recipientRows
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
              attributes: ['firstName', 'lastName'],
            },
          ],
        })
      : []
  const buyerById = new Map(
    buyers.map((b) => {
      const j = b.get({ plain: true }) as any
      return [
        j.id,
        [j.contact?.firstName, j.contact?.lastName].filter(Boolean).join(' ') ||
          'Unnamed',
      ]
    }),
  )

  const recipients = recipientRows.map((r) => {
    const j = r.get({ plain: true }) as any
    return {
      id: j.id as string,
      phone: j.phone as string,
      status: j.status as string,
      failReason: j.failReason as string | null,
      sentAt: j.sentAt as Date | null,
      deliveredAt: j.deliveredAt as Date | null,
      name:
        (j.subjectType === 'BUYER' && buyerById.get(j.subjectId)) ||
        '— direct phone —',
    }
  })

  return (
    <div>
      <Link
        href="/buyers?tab=sms-campaign"
        className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 transition-colors mb-2"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to SMS Campaigns
      </Link>

      <BlastDetailClient
        blast={{
          id: blastJson.id,
          name: blastJson.name,
          body: blastJson.body,
          status: blastJson.status,
          recipientCount: Number(blastJson.recipientCount),
          sentCount: Number(blastJson.sentCount),
          deliveredCount: Number(blastJson.deliveredCount),
          failedCount: Number(blastJson.failedCount),
          createdAt: blastJson.createdAt,
        }}
        recipients={recipients}
      />
    </div>
  )
}
