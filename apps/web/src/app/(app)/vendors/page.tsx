/**
 * Vendors page — same tab structure as /buyers (Contacts / SMS
 * Campaign / Import Log) but parameterised on the Vendor entity.
 *
 * Reuses BulkSmsModal + ImportLogClient via their `entity` prop and
 * the buyers `BuyerFilterBar` + `BuyerQuickFilter` + `ManageFiltersModal`
 * via their `pipeline='vendors'` prop. Folder + share state for
 * vendor saved filters is scoped per-pipeline so they stay separate
 * from buyer folders.
 */
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Megaphone } from 'lucide-react'
import { getVendorList, getVendorBlasts } from '@/lib/vendors'
import { VendorTable } from '@/components/vendors/VendorTable'
import { VendorsHeader } from '@/components/vendors/VendorsHeader'
import { ImportLogClient } from '@/components/buyers/ImportLogClient'
import { InactiveVendorsTable } from '@/components/vendors/InactiveVendorsTable'

interface PageProps {
  searchParams: Promise<{ tab?: string; search?: string; category?: string; page?: string }>
}

export const metadata = { title: 'Vendors' }

const TABS = [
  { key: 'contacts', label: 'Contacts' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'sms-campaign', label: 'SMS Campaign' },
  { key: 'import-log', label: 'Import Log' },
] as const

export default async function VendorsPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const tab = sp.tab ?? 'contacts'

  return (
    <div>
      <VendorsHeader />

      <div className="flex gap-1 mb-5 mt-4 border-b border-gray-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === 'contacts' ? '/vendors' : `/vendors?tab=${t.key}`}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === 'contacts' && <ContactsTab sp={sp} />}
      {tab === 'inactive' && <InactiveTab sp={sp} />}
      {tab === 'sms-campaign' && <SmsCampaignTab />}
      {tab === 'import-log' && <ImportLogClient entity="vendor" />}
    </div>
  )
}

async function ContactsTab({ sp }: { sp: { search?: string; category?: string; page?: string } }) {
  const { rows, total } = await getVendorList({
    search: sp.search,
    category: sp.category,
    page: sp.page ? parseInt(sp.page) : 1,
  })
  return <VendorTable rows={rows as any} total={total} />
}

async function InactiveTab({ sp }: { sp: { search?: string; page?: string } }) {
  const { rows } = await getVendorList({
    activeOnly: false,
    search: sp.search,
    page: sp.page ? parseInt(sp.page) : 1,
  })
  const inactive = rows.filter((r: any) => !r.isActive)
  return <InactiveVendorsTable rows={inactive as any} total={inactive.length} />
}

async function SmsCampaignTab() {
  const blasts = await getVendorBlasts()
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          Bulk SMS blasts targeting vendor contacts
        </p>
        <p className="text-[11px] text-gray-400 italic">
          Use the Contacts tab&apos;s Send Bulk SMS button to create a new blast.
        </p>
      </div>
      {blasts.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center h-48">
          <Megaphone className="w-8 h-8 text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">No SMS blasts yet</p>
          <p className="text-xs text-gray-300 mt-1">
            Filter vendors in the Contacts tab and use Send Bulk SMS to fire your first blast.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-4 py-2.5">Campaign</th>
                <th className="text-left px-4 py-2.5">Date Sent</th>
                <th className="text-left px-4 py-2.5">Message</th>
                <th className="text-center px-3 py-2.5">Recipients</th>
                <th className="text-center px-3 py-2.5">Sent</th>
                <th className="text-center px-3 py-2.5">Delivered</th>
                <th className="text-center px-3 py-2.5">Not Delivered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {blasts.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/vendors/sms-campaigns/${b.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {b.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-[12px] whitespace-nowrap">
                    {new Date(b.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[280px]">
                    <span className="line-clamp-1">{b.body}</span>
                  </td>
                  <td className="px-3 py-3 text-center text-gray-700">{b.recipientCount}</td>
                  <td className="px-3 py-3 text-center text-gray-700">{b.sentCount}</td>
                  <td className="px-3 py-3 text-center text-emerald-600 font-medium">
                    {b.deliveredCount}
                  </td>
                  <td className="px-3 py-3 text-center text-rose-600 font-medium">
                    {b.failedCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
