'use client'

import { Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Pagination } from '@/components/ui/Pagination'

interface ArchiveRow {
  id: string
  streetAddress: string | null
  city: string | null
  state: string | null
  zip: string | null
  leadType: string
  propertyStatus: string
  soldAt: Date | null
  offerPrice: unknown
  exitStrategy: string | null
  updatedAt: Date
  contacts: Array<{
    contact: { firstName: string; lastName: string | null; phone: string | null }
  }>
  assignedTo: { name: string } | null
}

interface Props {
  rows: ArchiveRow[]
  total: number
  type: 'sold' | 'rental'
  page: number
  pageSize: number
}

const EXIT_STRATEGY_LABELS: Record<string, string> = {
  WHOLESALE:       'Wholesale',
  SELLER_FINANCE:  'Seller Finance',
  INSTALLMENT:     'Installment',
  FIX_AND_FLIP:    'Fix & Flip',
  INVENTORY_LATER: 'Inventory',
  RENTAL:          'Rental',
  TURNKEY:         'Turnkey',
}

export function ArchiveTable({ rows, total, type, page, pageSize }: Props) {
  const router = useRouter()

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center h-48">
        <p className="text-sm text-gray-400">No {type === 'sold' ? 'sold' : 'rental'} properties yet</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="text-[11px] text-gray-400 px-4 py-2 border-b border-gray-100">
        {total} propert{total !== 1 ? 'ies' : 'y'}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
            <th className="text-left px-4 py-2.5">Address</th>
            <th className="text-left px-4 py-2.5">Contact</th>
            <th className="text-left px-4 py-2.5">Exit Strategy</th>
            {type === 'sold' && <th className="text-left px-4 py-2.5">Sale Price</th>}
            {type === 'sold' && <th className="text-left px-4 py-2.5">Sold Date</th>}
            <th className="text-left px-4 py-2.5">Assigned</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const detailPath = `/${type}/${row.id}`
            return (
              <tr
                key={row.id}
                onClick={() => router.push(detailPath)}
                className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{row.streetAddress ?? '—'}</p>
                  <p className="text-[11px] text-gray-400">{[row.city, row.state, row.zip].filter(Boolean).join(', ')}</p>
                </td>
                <td className="px-4 py-3">
                  {row.contacts[0]?.contact ? (
                    <div>
                      <p className="text-gray-800">{[row.contacts[0].contact.firstName, row.contacts[0].contact.lastName].filter(Boolean).join(' ')}</p>
                      <p className="text-[11px] text-gray-400">{row.contacts[0].contact.phone ?? '—'}</p>
                    </div>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3">
                  {row.exitStrategy ? (
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-700">
                      {EXIT_STRATEGY_LABELS[row.exitStrategy] ?? row.exitStrategy}
                    </span>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                {type === 'sold' && (
                  <td className="px-4 py-3 text-gray-800 font-medium">
                    {(row as any).soldPrice ? `$${Number((row as any).soldPrice).toLocaleString()}` : row.offerPrice ? `$${Number(row.offerPrice).toLocaleString()}` : <span className="text-gray-300">—</span>}
                  </td>
                )}
                {type === 'sold' && (
                  <td className="px-4 py-3 text-[11px] text-gray-500">
                    {row.soldAt ? format(new Date(row.soldAt), 'MMM d, yyyy') : <span className="text-gray-300">—</span>}
                  </td>
                )}
                <td className="px-4 py-3 text-gray-600">{row.assignedTo?.name ?? <span className="text-gray-300">—</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <Suspense>
        <Pagination page={page} pageSize={pageSize} total={total} />
      </Suspense>
    </div>
  )
}
