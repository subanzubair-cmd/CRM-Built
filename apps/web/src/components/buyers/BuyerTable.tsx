'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { UserCheck, UserX, Send } from 'lucide-react'
import { BuyerBlastModal } from './BuyerBlastModal'

interface BuyerRow {
  id: string
  isActive: boolean
  preferredMarkets: string[]
  createdAt: Date
  contact: {
    firstName: string
    lastName: string | null
    phone: string | null
    email: string | null
  }
  _count: { criteria: number; matches: number; offers: number }
  matches: Array<{ propertyId: string; dispoOfferAmount: unknown }>
}

interface Props {
  rows: BuyerRow[]
  total: number
}

export function BuyerTable({ rows, total }: Props) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [blastOpen, setBlastOpen] = useState(false)

  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someSelected = rows.some((r) => selectedIds.has(r.id))

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)))
    }
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center h-48">
        <p className="text-sm text-gray-400">No buyers yet — add your first buyer above</p>
      </div>
    )
  }

  return (
    <>
      {/* Selection action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-blue-50 border border-blue-100 rounded-xl">
          <span className="text-sm font-medium text-blue-700">
            {selectedIds.size} buyer{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => setBlastOpen(true)}
            className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            Send Blast
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-blue-500 hover:text-blue-700"
          >
            Clear
          </button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="text-[11px] text-gray-400 px-4 py-2 border-b border-gray-100">
          {total} buyer{total !== 1 ? 's' : ''}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
              <th className="px-4 py-2.5 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected
                  }}
                  onChange={toggleAll}
                  onClick={(e) => e.stopPropagation()}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 cursor-pointer"
                />
              </th>
              <th className="text-left px-4 py-2.5">Name</th>
              <th className="text-left px-4 py-2.5">Contact</th>
              <th className="text-left px-4 py-2.5">Markets</th>
              <th className="text-left px-4 py-2.5">Criteria</th>
              <th className="text-left px-4 py-2.5">Matches</th>
              <th className="text-left px-4 py-2.5">Deals</th>
              <th className="text-left px-4 py-2.5">Status</th>
              <th className="text-left px-4 py-2.5">Added</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => router.push(`/buyers/${row.id}`)}
                className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors ${
                  selectedIds.has(row.id) ? 'bg-blue-50/50' : ''
                }`}
              >
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={() => toggleRow(row.id)}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 cursor-pointer"
                  />
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">
                    {[row.contact.firstName, row.contact.lastName].filter(Boolean).join(' ')}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-gray-600">{row.contact.phone ?? '—'}</p>
                  <p className="text-[11px] text-gray-400">{row.contact.email ?? ''}</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {row.preferredMarkets.slice(0, 3).map((m) => (
                      <span key={m} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded">
                        {m}
                      </span>
                    ))}
                    {row.preferredMarkets.length > 3 && (
                      <span className="text-[10px] text-gray-400">+{row.preferredMarkets.length - 3}</span>
                    )}
                    {row.preferredMarkets.length === 0 && <span className="text-gray-300 text-[11px]">—</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">{row._count.criteria}</td>
                <td className="px-4 py-3 text-gray-600">{row._count.matches}</td>
                <td className="px-4 py-3 text-gray-600">{row.matches?.length ?? 0}</td>
                <td className="px-4 py-3">
                  {row.isActive ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-[11px] font-medium">
                      <UserCheck className="w-3 h-3" /> Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[11px] font-medium">
                      <UserX className="w-3 h-3" /> Inactive
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-[11px] text-gray-400">
                  {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {blastOpen && (
        <BuyerBlastModal
          selectedIds={Array.from(selectedIds)}
          onClose={() => {
            setBlastOpen(false)
            setSelectedIds(new Set())
          }}
        />
      )}
    </>
  )
}
