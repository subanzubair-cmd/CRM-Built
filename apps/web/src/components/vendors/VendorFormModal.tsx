'use client'

/**
 * Vendor add + edit modal — replaces AddVendorModal so a single
 * component handles both flows. Pass `vendorId` to switch into edit
 * mode; on open in edit mode the modal fetches the current values
 * via GET /api/vendors/[id].
 *
 * Now includes ContactFieldAutocomplete on name/phone/email fields
 * and inline duplicate warnings via useDuplicateCheck.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { DuplicateWarningModal } from '@/components/ui/DuplicateWarningModal'
import { DuplicateInlineWarning } from '@/components/ui/DuplicateInlineWarning'
import { ContactFieldAutocomplete } from '@/components/buyers/ContactFieldAutocomplete'
import { useDuplicateCheck } from '@/hooks/useDuplicateCheck'

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

interface Values {
  firstName: string
  lastName: string
  phone: string
  email: string
  category: string
  notes: string
  isActive: boolean
}

const EMPTY: Values = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  category: 'General Contractor',
  notes: '',
  isActive: true,
}

interface Props {
  open: boolean
  onClose: () => void
  /** When set, opens in edit mode and fetches the vendor on open. */
  vendorId?: string
}

export function VendorFormModal({ open, onClose, vendorId }: Props) {
  const router = useRouter()
  const [values, setValues] = useState<Values>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dup, setDup] = useState<{ message: string; existingVendorId: string } | null>(null)
  /** Contact id for the vendor being edited — excludes self from dup checks. */
  const [editContactId, setEditContactId] = useState<string | null>(null)

  const isEdit = !!vendorId

  // Inline duplicate checks on phone and email fields.
  const phoneDup = useDuplicateCheck({
    value: values.phone,
    field: 'phone',
    type: 'VENDOR',
    excludeContactId: editContactId ?? undefined,
  })
  const emailDup = useDuplicateCheck({
    value: values.email,
    field: 'email',
    type: 'VENDOR',
    excludeContactId: editContactId ?? undefined,
  })

  useEffect(() => {
    if (!open) return
    setError(null)
    setDup(null)
    if (!isEdit) {
      setValues(EMPTY)
      setEditContactId(null)
      return
    }
    setLoading(true)
    fetch(`/api/vendors/${vendorId}`)
      .then((r) => r.json())
      .then((res) => {
        const v = res?.data
        if (!v) {
          setError('Vendor not found.')
          return
        }
        if (v.contactId) setEditContactId(v.contactId)
        setValues({
          firstName: v.contact?.firstName ?? '',
          lastName: v.contact?.lastName ?? '',
          phone: v.contact?.phone ?? '',
          email: v.contact?.email ?? '',
          category: v.category ?? 'General Contractor',
          notes: v.notes ?? '',
          isActive: !!v.isActive,
        })
      })
      .catch(() => setError('Failed to load vendor.'))
      .finally(() => setLoading(false))
  }, [open, vendorId, isEdit])

  if (!open) return null

  function patch<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!values.firstName.trim()) {
      setError('First Name is required.')
      return
    }
    if (!values.category) {
      setError('Category is required.')
      return
    }
    if (!values.phone.trim() && !values.email.trim()) {
      setError('Provide at least one phone number or email.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim() || null,
        phone: values.phone.trim() || null,
        email: values.email.trim() || null,
        category: values.category,
        notes: values.notes.trim() || null,
      }
      if (isEdit) {
        payload.isActive = values.isActive
      }
      const url = isEdit ? `/api/vendors/${vendorId}` : '/api/vendors'
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409 && data.existingVendorId) {
          setDup({ message: data.error, existingVendorId: data.existingVendorId })
          return
        }
        setError(typeof data.error === 'string' ? data.error : 'Save failed.')
        return
      }
      toast.success(isEdit ? 'Vendor updated.' : 'Vendor added.')
      onClose()
      if (!isEdit && data?.data?.id) {
        router.push(`/vendors/${data.data.id}`)
      } else {
        router.refresh()
      }
    } catch (e: any) {
      setError(e.message ?? 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900">
            {isEdit ? 'Edit Vendor' : 'Add Vendor'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="p-6 text-center text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin inline" /> Loading…
          </div>
        ) : (
          <form onSubmit={submit} className="p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  First Name *
                </label>
                <ContactFieldAutocomplete
                  value={values.firstName}
                  onChange={(v) => patch('firstName', v)}
                  field="firstName"
                  type="VENDOR"
                  inputClassName={inputCls}
                  autoComplete="given-name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Last Name
                </label>
                <ContactFieldAutocomplete
                  value={values.lastName}
                  onChange={(v) => patch('lastName', v)}
                  field="lastName"
                  type="VENDOR"
                  inputClassName={inputCls}
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
              <ContactFieldAutocomplete
                value={values.phone}
                onChange={(v) => patch('phone', v)}
                field="phone"
                type="VENDOR"
                inputClassName={inputCls}
                inputType="tel"
                inputMode="tel"
                placeholder="(555) 555-5555"
              />
              {phoneDup.match && (
                <DuplicateInlineWarning
                  type="vendor"
                  match={phoneDup.match}
                  fieldLabel="phone number"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
              <ContactFieldAutocomplete
                value={values.email}
                onChange={(v) => patch('email', v)}
                field="email"
                type="VENDOR"
                inputClassName={inputCls}
                inputType="email"
                inputMode="email"
                placeholder="vendor@example.com"
              />
              {emailDup.match && (
                <DuplicateInlineWarning
                  type="vendor"
                  match={emailDup.match}
                  fieldLabel="email"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Category *
              </label>
              <select
                value={values.category}
                onChange={(e) => patch('category', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                {VENDOR_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={values.notes}
                onChange={(e) => patch('notes', e.target.value)}
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {isEdit && (
              <label className="flex items-center gap-2 text-[13px] text-gray-700">
                <input
                  type="checkbox"
                  checked={values.isActive}
                  onChange={(e) => patch('isActive', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Active
              </label>
            )}

            {error && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Vendor'}
              </button>
            </div>
          </form>
        )}
      </div>

      {dup && (
        <DuplicateWarningModal
          type="vendor"
          message={dup.message}
          existingId={dup.existingVendorId}
          viewUrl={`/vendors/${dup.existingVendorId}`}
          onClose={() => setDup(null)}
        />
      )}
    </div>
  )
}
