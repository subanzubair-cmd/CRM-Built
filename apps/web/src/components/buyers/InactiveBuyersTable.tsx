'use client'

/**
 * Table showing soft-deleted (inactive) buyers with Restore and
 * Permanently Delete actions. Used in the "Inactive" tab on the
 * /buyers page.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { RotateCcw, Trash2, AlertTriangle, UserX } from 'lucide-react'
import { toast } from 'sonner'

interface InactiveBuyerRow {
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
}

interface Props {
  rows: InactiveBuyerRow[]
  total: number
}

export function InactiveBuyersTable({ rows, total }: Props) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  async function restore(id: string, name: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/buyers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      })
      if (!res.ok) throw new Error('Failed.')
      toast.success(`"${name}" restored to active buyers.`)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to restore.')
    } finally {
      setBusyId(null)
    }
  }

  async function hardDelete(id: string, name: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/buyers/${id}?permanent=1`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed.')
      toast.success(`"${name}" permanently deleted.`)
      setConfirmDeleteId(null)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to delete.')
    } finally {
      setBusyId(null)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center h-48">
        <UserX className="w-8 h-8 text-gray-300 mb-2" />
        <p className="text-sm text-gray-400">No inactive buyers</p>
        <p className="text-xs text-gray-300 mt-1">
          Deleted or deactivated buyers will appear here.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-4 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
        <p className="text-[13px] text-amber-800">
          These buyers were soft-deleted or deactivated. You can restore them back to active status or permanently delete them.
          <strong> Permanent deletion cannot be undone.</strong>
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="text-[11px] text-gray-400 px-4 py-2 border-b border-gray-100">
          {total} inactive buyer{total !== 1 ? 's' : ''}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left px-4 py-2.5">Name</th>
              <th className="text-left px-4 py-2.5">Contact</th>
              <th className="text-left px-4 py-2.5">Markets</th>
              <th className="text-left px-4 py-2.5">Added</th>
              <th className="text-center px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const name =
                [row.contact.firstName, row.contact.lastName]
                  .filter(Boolean)
                  .join(' ') || 'Unnamed'
              return (
                <tr
                  key={row.id}
                  className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-600">{name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-500">{row.contact.phone ?? '—'}</p>
                    <p className="text-[11px] text-gray-400">
                      {row.contact.email ?? ''}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {row.preferredMarkets.slice(0, 3).map((m) => (
                        <span
                          key={m}
                          className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] rounded"
                        >
                          {m}
                        </span>
                      ))}
                      {row.preferredMarkets.length > 3 && (
                        <span className="text-[10px] text-gray-400">
                          +{row.preferredMarkets.length - 3}
                        </span>
                      )}
                      {row.preferredMarkets.length === 0 && (
                        <span className="text-gray-300 text-[11px]">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-gray-400">
                    {formatDistanceToNow(new Date(row.createdAt), {
                      addSuffix: true,
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => restore(row.id, name)}
                        disabled={busyId === row.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors disabled:opacity-50"
                        title="Restore to active"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Restore
                      </button>
                      {confirmDeleteId === row.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => hardDelete(row.id, name)}
                            disabled={busyId === row.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1.5 text-[12px] text-gray-500 hover:text-gray-700"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(row.id)}
                          disabled={busyId === row.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Permanently delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete Forever
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
