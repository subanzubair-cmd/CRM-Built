import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getDispoList, getDispoPropertyBuyerMatches } from '@/lib/pipelines'
import { DispoWorkspace } from '@/components/dispo/DispoWorkspace'
import type { BuyerMatchRow } from '@/components/dispo/BuyerKanban'

interface PageProps {
  searchParams: Promise<{ propertyId?: string }>
}

export const metadata = { title: 'Dispo' }

export default async function DispoPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { propertyId } = await searchParams

  const [{ rows }, buyerMatches] = await Promise.all([
    getDispoList({
      page: 1,
      pageSize: 200,
    }),
    propertyId ? getDispoPropertyBuyerMatches(propertyId) : Promise.resolve([]),
  ])

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
    />
  )
}
