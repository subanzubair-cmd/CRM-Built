import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getVendorById } from '@/lib/vendors'
import Link from 'next/link'
import { ChevronLeft, Phone, Mail, MapPin } from 'lucide-react'

type Params = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Params) {
  const { id } = await params
  const vendor = await getVendorById(id)
  const name = vendor?.contact
    ? [vendor.contact.firstName, vendor.contact.lastName].filter(Boolean).join(' ')
    : ''
  return { title: name || 'Vendor' }
}

export default async function VendorDetailPage({ params }: Params) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const vendor = await getVendorById(id)
  if (!vendor) notFound()

  const fullName = [vendor.contact.firstName, vendor.contact.lastName].filter(Boolean).join(' ')

  return (
    <div>
      <Link href="/vendors" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3">
        <ChevronLeft className="w-4 h-4" />
        Vendors
      </Link>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-gray-900">{fullName}</h1>
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">{vendor.category}</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              {vendor.contact.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{vendor.contact.phone}</span>}
              {vendor.contact.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{vendor.contact.email}</span>}
              {(vendor.contact as any).city && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{[(vendor.contact as any).city, (vendor.contact as any).state, (vendor.contact as any).zip].filter(Boolean).join(', ')}</span>}
            </div>
            {vendor.notes && <p className="text-sm text-gray-500 mt-2 max-w-lg">{vendor.notes}</p>}
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${vendor.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {vendor.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
        {vendor.markets.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {vendor.markets.map((m) => (
              <span key={m} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">{m}</span>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Contact Details</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {([
            ['Phone', vendor.contact.phone],
            ['Phone 2', (vendor.contact as any).phone2],
            ['Email', vendor.contact.email],
            ['Address', (vendor.contact as any).address],
            ['City', (vendor.contact as any).city],
            ['State', (vendor.contact as any).state],
            ['Zip', (vendor.contact as any).zip],
          ] as [string, string | null | undefined][]).filter(([, v]) => v).map(([label, value]) => (
            <div key={label}>
              <dt className="text-gray-500">{label}</dt>
              <dd className="text-gray-900 font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
