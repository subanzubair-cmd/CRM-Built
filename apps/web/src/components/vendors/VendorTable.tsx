'use client'

import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'

interface VendorRow {
  id: string
  category: string
  isActive: boolean
  markets: string[]
  notes: string | null
  createdAt: Date
  contact: {
    firstName: string
    lastName: string | null
    phone: string | null
    email: string | null
  }
}

interface Props {
  rows: VendorRow[]
  total: number
}

export function VendorTable({ rows, total }: Props) {
  const router = useRouter()

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center h-48">
        <p className="text-sm text-gray-400">No vendors yet — add your first vendor above</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="text-[11px] text-gray-400 px-4 py-2 border-b border-gray-100">
        {total} vendor{total !== 1 ? 's' : ''}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
            <th className="text-left px-4 py-2.5">Name</th>
            <th className="text-left px-4 py-2.5">Category</th>
            <th className="text-left px-4 py-2.5">Contact</th>
            <th className="text-left px-4 py-2.5">Markets</th>
            <th className="text-left px-4 py-2.5">Status</th>
            <th className="text-left px-4 py-2.5">Added</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => router.push(`/vendors/${row.id}`)}
              className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <td className="px-4 py-3">
                <p className="font-medium text-gray-900">
                  {[row.contact.firstName, row.contact.lastName].filter(Boolean).join(' ')}
                </p>
              </td>
              <td className="px-4 py-3">
                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-700">{row.category}</span>
              </td>
              <td className="px-4 py-3">
                <p className="text-gray-600">{row.contact.phone ?? '—'}</p>
                <p className="text-[11px] text-gray-400">{row.contact.email ?? ''}</p>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {row.markets.slice(0, 2).map((m) => (
                    <span key={m} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded">{m}</span>
                  ))}
                  {row.markets.length > 2 && <span className="text-[10px] text-gray-400">+{row.markets.length - 2}</span>}
                  {row.markets.length === 0 && <span className="text-gray-300 text-[11px]">—</span>}
                </div>
              </td>
              <td className="px-4 py-3">
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${row.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {row.isActive ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td className="px-4 py-3 text-[11px] text-gray-400">
                {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
