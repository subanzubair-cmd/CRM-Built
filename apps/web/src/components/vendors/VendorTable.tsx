'use client'

/**
 * Vendor list with selection + filter bar + Bulk SMS action — same
 * shape as `BuyerTable` but parameterised for the Vendor entity.
 *
 * Reuses the buyers BuyerFilterBar + BulkSmsModal components by
 * passing `pipeline='vendors'` / `entity='vendor'`. The Quick Filter
 * panel + Manage Filters modal both already accept those props.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { Send, UserCheck, UserX, Pencil, Trash2 } from 'lucide-react'
import { formatPhone } from '@/lib/phone'
import { toast } from 'sonner'
import { BulkSmsModal } from '@/components/buyers/BulkSmsModal'
import { BuyerFilterBar } from '@/components/buyers/BuyerFilterBar'
import type { QuickFilterState } from '@/components/buyers/BuyerQuickFilter'
import { VendorFormModal } from './VendorFormModal'

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkSmsOpen, setBulkSmsOpen] = useState(false)
  const [filter, setFilter] = useState<QuickFilterState>({ enabled: [], values: {} })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function deleteVendor(id: string, name: string) {
    if (!confirm(`Mark "${name}" as inactive? This is a soft delete — they stop appearing in active lists but their data is preserved.`))
      return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/vendors/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed.')
      toast.success(`"${name}" marked inactive.`)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message ?? 'Failed.')
    } finally {
      setDeletingId(null)
    }
  }

  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someSelected = rows.some((r) => selectedIds.has(r.id))

  function toggleAll() {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(rows.map((r) => r.id)))
  }
  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <>
      <BuyerFilterBar pipeline="vendors" filter={filter} onChange={setFilter} />

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-blue-50 border border-blue-100 rounded-xl">
          <span className="text-sm font-medium text-blue-700">
            {selectedIds.size} vendor{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => setBulkSmsOpen(true)}
            className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            Send Bulk SMS
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-blue-500 hover:text-blue-700"
          >
            Clear
          </button>
        </div>
      )}

      {selectedIds.size === 0 && filter.enabled.length > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-emerald-50 border border-emerald-100 rounded-xl">
          <span className="text-sm font-medium text-emerald-800">
            Filter active — {filter.enabled.length} parameter
            {filter.enabled.length === 1 ? '' : 's'}
          </span>
          <button
            onClick={() => setBulkSmsOpen(true)}
            className="flex items-center gap-1.5 text-xs font-medium bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            Send Bulk SMS to filtered set
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center h-48">
          <p className="text-sm text-gray-400">
            No vendors yet — add your first vendor above
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="text-[11px] text-gray-400 px-4 py-2 border-b border-gray-100">
            {total} vendor{total !== 1 ? 's' : ''}
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
                <th className="text-left px-4 py-2.5">Category</th>
                <th className="text-left px-4 py-2.5">Contact</th>
                <th className="text-left px-4 py-2.5">Markets</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Added</th>
                <th className="text-center px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/vendors/${row.id}`)}
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
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-700">
                      {row.category}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-600">{formatPhone(row.contact.phone) || '—'}</p>
                    <p className="text-[11px] text-gray-400">{row.contact.email ?? ''}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {row.markets.slice(0, 2).map((m) => (
                        <span key={m} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded">
                          {m}
                        </span>
                      ))}
                      {row.markets.length > 2 && (
                        <span className="text-[10px] text-gray-400">
                          +{row.markets.length - 2}
                        </span>
                      )}
                      {row.markets.length === 0 && (
                        <span className="text-gray-300 text-[11px]">—</span>
                      )}
                    </div>
                  </td>
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
                  <td
                    className="px-4 py-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingId(row.id)}
                        className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Edit vendor"
                        aria-label="Edit vendor"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          deleteVendor(
                            row.id,
                            [row.contact.firstName, row.contact.lastName]
                              .filter(Boolean)
                              .join(' ') || 'this vendor',
                          )
                        }
                        disabled={deletingId === row.id}
                        className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                        title="Delete vendor"
                        aria-label="Delete vendor"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {bulkSmsOpen && (
        <BulkSmsModal
          entity="vendor"
          selectedBuyerIds={Array.from(selectedIds)}
          filter={selectedIds.size === 0 && filter.enabled.length > 0 ? (filter as any) : null}
          onClose={() => {
            setBulkSmsOpen(false)
            setSelectedIds(new Set())
          }}
          onSent={(blastId) => router.push(`/vendors/sms-campaigns/${blastId}`)}
        />
      )}

      {editingId && (
        <VendorFormModal
          open={!!editingId}
          onClose={() => setEditingId(null)}
          vendorId={editingId}
        />
      )}
    </>
  )
}
