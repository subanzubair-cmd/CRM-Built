import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getVendorList } from '@/lib/vendors'
import { VendorTable } from '@/components/vendors/VendorTable'
import { VendorsHeader } from '@/components/vendors/VendorsHeader'

interface PageProps {
  searchParams: Promise<{ search?: string; category?: string; page?: string }>
}

export const metadata = { title: 'Vendors' }

export default async function VendorsPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const { rows, total } = await getVendorList({
    search: sp.search,
    category: sp.category,
    page: sp.page ? parseInt(sp.page) : 1,
  })

  return (
    <div>
      <VendorsHeader />
      <VendorTable rows={rows as any} total={total} />
    </div>
  )
}
