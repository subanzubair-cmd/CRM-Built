'use client'

/**
 * Edit / Mark inactive / Delete button strip for the vendor detail
 * header. Mirrors BuyerHeaderActions: edit opens VendorFormModal in
 * edit mode; mark-inactive flips Vendor.isActive via PATCH; delete
 * is a soft delete (also via PATCH isActive=false) with confirm.
 *
 * Auto-opens the edit modal when arriving via /vendors/[id]?edit=1
 * — matches the row-action "Edit" affordance on the vendors table.
 */

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Pencil, Trash2, UserCheck, UserX } from 'lucide-react'
import { toast } from 'sonner'
import { VendorFormModal } from './VendorFormModal'

export function VendorHeaderActions({
  vendorId,
  displayName,
  isActive,
}: {
  vendorId: string
  displayName: string
  isActive: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [editOpen, setEditOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (params?.get('edit') === '1') {
      setEditOpen(true)
      const url = new URL(window.location.href)
      url.searchParams.delete('edit')
      window.history.replaceState({}, '', url.toString())
    }
  }, [params])

  async function toggleActive() {
    if (!confirm(isActive ? 'Mark this vendor as Inactive?' : 'Mark this vendor as Active?'))
      return
    setBusy(true)
    try {
      const res = await fetch(`/api/vendors/${vendorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive }),
      })
      if (!res.ok) throw new Error('Failed.')
      toast.success(isActive ? 'Marked inactive.' : 'Marked active.')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message ?? 'Failed.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteVendor() {
    if (
      !confirm(
        `Mark "${displayName || 'this vendor'}" as inactive? They stop appearing in active lists but their data is preserved.`,
      )
    )
      return
    setBusy(true)
    try {
      const res = await fetch(`/api/vendors/${vendorId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed.')
      toast.success('Vendor marked inactive.')
      router.push('/vendors')
    } catch (e: any) {
      toast.error(e.message ?? 'Failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <button
        type="button"
        onClick={() => setEditOpen(true)}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" />
        Edit
      </button>
      <button
        type="button"
        onClick={toggleActive}
        disabled={busy}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded-lg disabled:opacity-50"
      >
        {isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
        {isActive ? 'Mark Inactive' : 'Mark Active'}
      </button>
      <button
        type="button"
        onClick={deleteVendor}
        disabled={busy}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-lg disabled:opacity-50"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Delete
      </button>
      <VendorFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        vendorId={vendorId}
      />
    </div>
  )
}
