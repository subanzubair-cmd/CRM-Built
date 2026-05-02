import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getDispoList, getDispoPropertyBuyerMatches } from '@/lib/pipelines'
import { DispoWorkspace } from '@/components/dispo/DispoWorkspace'
import type { BuyerMatchRow } from '@/components/dispo/BuyerKanban'
import { SYSTEM_STAGE_COLORS } from '@/components/dispo/BuyerKanban'
import { PipelineStageConfig } from '@crm/database'

interface PageProps {
  searchParams: Promise<{ propertyId?: string }>
}

export const metadata = { title: 'Dispo' }

export default async function DispoPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { propertyId } = await searchParams

  const [{ rows }, buyerMatches, stageRows] = await Promise.all([
    getDispoList({
      page: 1,
      pageSize: 200,
    }),
    propertyId ? getDispoPropertyBuyerMatches(propertyId) : Promise.resolve([]),
    PipelineStageConfig.findAll({
      where: { pipeline: 'dispo', isActive: true },
      order: [['sortOrder', 'ASC']],
    }),
  ])

  const EXTRA_COLORS = [
    { color: 'bg-purple-50 border-purple-200', dot: 'bg-purple-400' },
    { color: 'bg-pink-50 border-pink-200',     dot: 'bg-pink-400' },
    { color: 'bg-indigo-50 border-indigo-200', dot: 'bg-indigo-400' },
    { color: 'bg-teal-50 border-teal-200',     dot: 'bg-teal-400' },
  ]
  let extraIdx = 0
  const initialStages = stageRows.length > 0
    ? stageRows.map((s) => {
        const sys = SYSTEM_STAGE_COLORS[(s as any).stageCode]
        const colors = sys ?? EXTRA_COLORS[extraIdx++ % EXTRA_COLORS.length]
        return { key: (s as any).stageCode, label: (s as any).label, ...colors }
      })
    : undefined

  // Serialize buyer matches for client component
  const serializedMatches: BuyerMatchRow[] = buyerMatches.map((m) => ({
    id: m.id,
    dispoStage: m.dispoStage as BuyerMatchRow['dispoStage'],
    score: m.score,
    dispoOfferAmount: (m as any).dispoOfferAmount != null ? Number((m as any).dispoOfferAmount) : null,
    createdAt: m.createdAt.toISOString(),
    buyer: {
      id: m.buyer.id,
      contact: {
        firstName: m.buyer.contact.firstName,
        lastName: m.buyer.contact.lastName ?? null,
        phone: m.buyer.contact.phone ?? null,
        email: m.buyer.contact.email ?? null,
      },
    },
  }))

  return (
    <DispoWorkspace
      properties={rows as any}
      selectedPropertyId={propertyId ?? null}
      buyerMatches={serializedMatches}
      initialStages={initialStages}
    />
  )
}
