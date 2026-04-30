'use client'

/**
 * Edit / Mark inactive button strip for the buyer detail header.
 * Wraps BuyerFormModal in edit mode so the existing modal handles
 * field validation + multi-phone/email + custom questions in one
 * place.
 *
 * The buyer detail page is a server component (data fetched via
 * getBuyerById). This client wrapper takes a snapshot of the
 * relevant fields and mounts the modal on demand. After save it
 * calls router.refresh() so the server component re-runs.
 */

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Pencil, UserX, UserCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { BuyerFormModal } from './BuyerFormModal'

type Snapshot = {
  buyerId: string
  firstName: string
  lastName: string
  contactType: 'BUYER' | 'AGENT'
  phones: Array<{ label: string; number: string }>
  emails: Array<{ label: string; email: string }>
  mailingAddress: string
  howHeardAbout: string
  assignedUserId: string
  notes: string
  targetCities: string[]
  targetZips: string[]
  targetCounties: string[]
  targetStates: string[]
  customQuestions: Record<string, unknown>
  vipFlag: boolean
  isActive: boolean
}

export function BuyerHeaderActions({ snapshot }: { snapshot: Snapshot }) {
  const router = useRouter()
  const params = useSearchParams()
  const [editOpen, setEditOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  // Auto-open the edit modal when arriving via the row-action
  // "Edit" button on /buyers (which appends ?edit=1).
  useEffect(() => {
    if (params?.get('edit') === '1') {
      setEditOpen(true)
      // Drop the query so a refresh doesn't keep re-opening it.
      const url = new URL(window.location.href)
      url.searchParams.delete('edit')
      window.history.replaceState({}, '', url.toString())
    }
  }, [params])

  async function deleteBuyer() {
    if (
      !confirm(
        `Mark "${[snapshot.firstName, snapshot.lastName].filter(Boolean).join(' ') || 'this buyer'}" as inactive? They stop appearing in active lists but their data is preserved.`,
      )
    )
      return
    setBusy(true)
    try {
      const res = await fetch(`/api/buyers/${snapshot.buyerId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed.')
      toast.success('Buyer marked inactive.')
      router.push('/buyers')
    } catch (e: any) {
      toast.error(e.message ?? 'Failed.')
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive() {
    if (!confirm(snapshot.isActive ? 'Mark this buyer as Inactive?' : 'Mark this buyer as Active?'))
      return
    setBusy(true)
    try {
      const res = await fetch(`/api/buyers/${snapshot.buyerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !snapshot.isActive }),
      })
      if (!res.ok) throw new Error('Failed.')
      toast.success(snapshot.isActive ? 'Marked inactive.' : 'Marked active.')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message ?? 'Failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
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
        {snapshot.isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
        {snapshot.isActive ? 'Mark Inactive' : 'Mark Active'}
      </button>
      <button
        type="button"
        onClick={deleteBuyer}
        disabled={busy}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-lg disabled:opacity-50"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Delete
      </button>

      <BuyerFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        buyerId={snapshot.buyerId}
        initial={{
          firstName: snapshot.firstName,
          lastName: snapshot.lastName,
          contactType: snapshot.contactType,
          phones: snapshot.phones.length ? snapshot.phones : [{ label: 'primary', number: '' }],
          emails: snapshot.emails.length ? snapshot.emails : [{ label: 'primary', email: '' }],
          mailingAddress: snapshot.mailingAddress,
          howHeardAbout: snapshot.howHeardAbout,
          assignedUserId: snapshot.assignedUserId,
          notes: snapshot.notes,
          targetCities: snapshot.targetCities,
          targetZips: snapshot.targetZips,
          targetCounties: snapshot.targetCounties,
          targetStates: snapshot.targetStates,
          customQuestions: snapshot.customQuestions,
          vipFlag: snapshot.vipFlag,
        }}
      />
    </div>
  )
}
