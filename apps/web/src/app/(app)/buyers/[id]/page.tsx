import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getBuyerById } from '@/lib/buyers'
import { BuyerCriteriaCard } from '@/components/buyers/BuyerCriteriaCard'
import { BuyerMatchHistoryCard } from '@/components/buyers/BuyerMatchHistoryCard'
import { BuyerOfferHistoryCard } from '@/components/buyers/BuyerOfferHistoryCard'
import { BuyerNotesCard } from '@/components/buyers/BuyerNotesCard'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

type Params = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Params) {
  const { id } = await params
  const buyer = await getBuyerById(id)
  const name = buyer?.contact
    ? [buyer.contact.firstName, buyer.contact.lastName].filter(Boolean).join(' ')
    : ''
  return { title: name || 'Buyer' }
}

export default async function BuyerDetailPage({ params }: Params) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const buyer = await getBuyerById(id)
  if (!buyer) notFound()

  const fullName = [buyer.contact.firstName, buyer.contact.lastName].filter(Boolean).join(' ')

  return (
    <div>
      <Link href="/buyers" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3">
        <ChevronLeft className="w-4 h-4" />
        Buyers
      </Link>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{fullName}</h1>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
              {buyer.contact.phone && <span>{buyer.contact.phone}</span>}
              {buyer.contact.email && <span>{buyer.contact.email}</span>}
            </div>
            {buyer.notes && <p className="text-sm text-gray-500 mt-2 max-w-lg">{buyer.notes}</p>}
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${buyer.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {buyer.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
        {buyer.preferredMarkets.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {buyer.preferredMarkets.map((m: string) => (
              <span key={m} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">{m}</span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <BuyerCriteriaCard buyerId={buyer.id} criteria={buyer.criteria as any} />
          <BuyerMatchHistoryCard matches={(buyer.matches as any[])?.map((m: any) => ({ ...m, score: Number(m.score), dispoOfferAmount: m.dispoOfferAmount ? Number(m.dispoOfferAmount) : null })) ?? []} />
        </div>
        <div className="space-y-4">
          <BuyerNotesCard
            buyerName={fullName}
            buyerId={buyer.id}
            matchedPropertyIds={(buyer.matches as any[])?.map((m: any) => m.propertyId) ?? []}
            propertyAddresses={Object.fromEntries(
              (buyer.matches as any[])
                ?.filter((m: any) => m.property?.streetAddress)
                .map((m: any) => [m.propertyId, [m.property.streetAddress, m.property.city, m.property.state, m.property.zip].filter(Boolean).join(', ')]) ?? []
            )}
          />
          <BuyerOfferHistoryCard offers={(buyer.offers as any[])?.map((o: any) => ({ ...o, dispoOfferAmount: o.dispoOfferAmount ? Number(o.dispoOfferAmount) : null, earnestMoney: o.earnestMoney ? Number(o.earnestMoney) : null, expectedProfit: o.expectedProfit ? Number(o.expectedProfit) : null })) ?? []} />
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Contact Info</h3>
            <dl className="space-y-1.5 text-sm">
              {([
                ['Phone', buyer.contact.phone],
                ['Phone 2', (buyer.contact as any).phone2],
                ['Email', buyer.contact.email],
                ['Address', (buyer.contact as any).address],
                ['City', (buyer.contact as any).city],
                ['State', (buyer.contact as any).state],
              ] as [string, string | null | undefined][]).filter(([, v]) => v).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-2">
                  <dt className="text-gray-500 flex-shrink-0">{label}</dt>
                  <dd className="text-gray-900 text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}
