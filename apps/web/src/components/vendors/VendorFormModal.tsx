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
  howHeardAbout: string
  notes: string
  isActive: boolean
}

const EMPTY: Values = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  category: 'General Contractor',
  howHeardAbout: '',
  notes: '',
  isActive: true,
}

type FieldErrorKey = 'firstName' | 'category' | 'contact' | 'howHeardAbout'

interface Props {
  open: boolean
  onClose: () => void
  /** When set, opens in edit mode and fetches the vendor on open. */
  vendorId?: string
  /** When provided alongside vendorId, skip the fetch and pre-populate the form. */
  initial?: {
    firstName: string
    lastName: string
    phones: Array<{ label: string; number: string }>
    emails: Array<{ label: string; email: string }>
    category: string
    markets: string[]
    notes: string
    isActive: boolean
    howHeardAbout: string
  }
}

export function VendorFormModal({ open, onClose, vendorId, initial }: Props) {
  const router = useRouter()
  const [values, setValues] = useState<Values>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldErrorKey, string>>>({})
  const [dup, setDup] = useState<{ message: string; existingVendorId: string } | null>(null)
  /** Contact id for the vendor being edited — excludes self from dup checks. */
  const [editContactId, setEditContactId] = useState<string | null>(null)

  const isEdit = !!vendorId
  const [vendorSources, setVendorSources] = useState<string[]>([])

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
    setFieldErrors({})
    setDup(null)
    // Load vendor sources for the "How did you hear about us?" dropdown
    fetch('/api/contact-sources?type=vendor')
      .then((r) => r.json())
      .then((res) => setVendorSources(Array.isArray(res?.data) ? res.data : []))
      .catch(() => {})
    if (!isEdit) {
      setValues(EMPTY)
      setEditContactId(null)
      return
    }
    // Skip the network fetch when caller has provided initial values.
    if (initial) {
      setValues({
        firstName: initial.firstName,
        lastName: initial.lastName,
        phone: initial.phones[0]?.number ?? '',
        email: initial.emails[0]?.email ?? '',
        category: initial.category,
        howHeardAbout: initial.howHeardAbout ?? '',
        notes: initial.notes,
        isActive: initial.isActive,
      })
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
          howHeardAbout: v.contact?.howHeardAbout ?? '',
          notes: v.notes ?? '',
          isActive: !!v.isActive,
        })
      })
      .catch(() => setError('Failed to load vendor.'))
      .finally(() => setLoading(false))
  }, [open, vendorId, isEdit, initial])

  if (!open) return null

  function patch<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
    // Clear field-level error when user edits the field.
    if (key === 'firstName' && fieldErrors.firstName) {
      setFieldErrors((prev) => ({ ...prev, firstName: undefined }))
    }
    if (key === 'category' && fieldErrors.category) {
      setFieldErrors((prev) => ({ ...prev, category: undefined }))
    }
    if (key === 'howHeardAbout' && fieldErrors.howHeardAbout) {
      setFieldErrors((prev) => ({ ...prev, howHeardAbout: undefined }))
    }
    if ((key === 'phone' || key === 'email') && fieldErrors.contact) {
      setFieldErrors((prev) => ({ ...prev, contact: undefined }))
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()

    // Validate all required fields at once.
    const errs: Partial<Record<FieldErrorKey, string>> = {}
    if (!values.firstName.trim()) errs.firstName = 'First Name is required.'
    if (!values.category) errs.category = 'Category is required.'
    if (!values.phone.trim() && !values.email.trim()) errs.contact = 'At least one phone number or email is required.'
    if (!values.howHeardAbout) errs.howHeardAbout = 'This field is required.'

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      setError(null)
      return
    }

    setFieldErrors({})
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim() || null,
        phone: values.phone.trim() || null,
        email: values.email.trim() || null,
        category: values.category,
        howHeardAbout: values.howHeardAbout || null,
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

  const inputCls = (hasErr?: boolean) =>
    `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
      hasErr
        ? 'border-red-400 ring-red-400 focus:ring-red-400'
        : 'border-gray-200 focus:ring-blue-500'
    }`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto">
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
              <VField label="First Name" required error={fieldErrors.firstName}>
                <ContactFieldAutocomplete
                  value={values.firstName}
                  onChange={(v) => patch('firstName', v)}
                  field="firstName"
                  type="VENDOR"
                  inputClassName={inputCls(!!fieldErrors.firstName)}
                  autoComplete="given-name"
                />
              </VField>
              <VField label="Last Name">
                <ContactFieldAutocomplete
                  value={values.lastName}
                  onChange={(v) => patch('lastName', v)}
                  field="lastName"
                  type="VENDOR"
                  inputClassName={inputCls()}
                  autoComplete="family-name"
                />
              </VField>
            </div>

            <VField label="Phone" required error={fieldErrors.contact ? ' ' : undefined}>
              <ContactFieldAutocomplete
                value={values.phone}
                onChange={(v) => patch('phone', v)}
                field="phone"
                type="VENDOR"
                inputClassName={inputCls(!!fieldErrors.contact)}
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
            </VField>

            <VField label="Email" required error={fieldErrors.contact ? ' ' : undefined}>
              <ContactFieldAutocomplete
                value={values.email}
                onChange={(v) => patch('email', v)}
                field="email"
                type="VENDOR"
                inputClassName={inputCls(!!fieldErrors.contact)}
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
            </VField>
            {fieldErrors.contact ? (
              <p className="text-[11px] text-red-500">{fieldErrors.contact}</p>
            ) : (
              <p className="text-[10px] text-gray-400 italic">
                At least one phone number or email is required.
              </p>
            )}

            <VField label="Category" required error={fieldErrors.category}>
              <select
                value={values.category}
                onChange={(e) => patch('category', e.target.value)}
                className={inputCls(!!fieldErrors.category)}
              >
                {VENDOR_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </VField>

            <VField label="How did you hear about us?" required error={fieldErrors.howHeardAbout}>
              <select
                value={values.howHeardAbout}
                onChange={(e) => patch('howHeardAbout', e.target.value)}
                className={inputCls(!!fieldErrors.howHeardAbout)}
              >
                <option value="">— Select source —</option>
                {vendorSources.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </VField>

            <VField label="Notes">
              <textarea
                value={values.notes}
                onChange={(e) => patch('notes', e.target.value)}
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </VField>

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

/** Field wrapper with label, required asterisk, and inline error. */
function VField({
  label,
  required,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </label>
      {children}
      {error && error.trim() && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </div>
  )
}
