'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DuplicateWarningModal } from '@/components/ui/DuplicateWarningModal'

interface Props {
  open: boolean
  onClose: () => void
}

const VENDOR_CATEGORIES = [
  'General Contractor',
  'Plumber',
  'Electrician',
  'HVAC',
  'Roofer',
  'Painter',
  'Flooring',
  'Inspector',
  'Title Company',
  'Attorney',
  'Insurance',
  'Property Manager',
  'Photographer',
  'Other',
]

export function AddVendorModal({ open, onClose }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [dupWarning, setDupWarning] = useState<{ message: string; existingVendorId: string } | null>(null)

  if (!open) return null

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)

    const body = {
      firstName: fd.get('firstName') as string,
      lastName: (fd.get('lastName') as string) || undefined,
      phone: (fd.get('phone') as string) || undefined,
      email: (fd.get('email') as string) || undefined,
      category: fd.get('category') as string,
      notes: (fd.get('notes') as string) || undefined,
    }

    const res = await fetch('/api/vendors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()

    if (!res.ok) {
      if (res.status === 409 && json.existingVendorId) {
        setDupWarning({ message: json.error, existingVendorId: json.existingVendorId })
        return
      }
      setError(typeof json.error === 'string' ? json.error : 'Failed to create vendor')
      return
    }

    startTransition(() => {
      router.push(`/vendors/${json.data.id}`)
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Vendor</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">First Name *</label>
              <input name="firstName" required placeholder="Jane" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Last Name</label>
              <input name="lastName" placeholder="Doe" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Category *</label>
            <select name="category" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select category...</option>
              {VENDOR_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
            <input name="phone" type="tel" placeholder="(555) 000-0000" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input name="email" type="email" placeholder="jane@contractor.com" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea name="notes" rows={2} placeholder="Licensed in TX, great work on kitchens..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={isPending} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={isPending} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">
              {isPending ? 'Adding...' : 'Add Vendor'}
            </button>
          </div>
        </form>
      </div>
      {dupWarning && (
        <DuplicateWarningModal
          type="vendor"
          message={dupWarning.message}
          existingId={dupWarning.existingVendorId}
          viewUrl={`/vendors/${dupWarning.existingVendorId}`}
          onClose={() => setDupWarning(null)}
        />
      )}
    </div>
  )
}
