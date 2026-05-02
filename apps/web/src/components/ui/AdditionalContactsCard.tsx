'use client'

/**
 * AdditionalContactsCard — displays and manages extra contacts
 * linked to a Buyer or Vendor (e.g. Brother, Friend, Attorney).
 *
 * Supports add / edit / delete with inline forms. Contact types are
 * fetched from the /api/contact-types settings endpoint.
 */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { formatPhone } from '@/lib/phone'
import {
  UserPlus,
  Pencil,
  Trash2,
  X,
  Loader2,
  Users,
  Phone,
  Mail,
} from 'lucide-react'
import { PhoneActions, EmailActions } from './ContactActionButtons'

interface AdditionalContactRow {
  id: string
  relationship: string
  firstName: string
  lastName: string | null
  phone: string | null
  email: string | null
  notes: string | null
}

type DupeWarning =
  | { kind: 'local'; existingContact: AdditionalContactRow }
  | { kind: 'system'; name: string; role: string; buyerId: string | null; vendorId: string | null }
  | null

interface Props {
  subjectType: 'BUYER' | 'VENDOR'
  subjectId: string
}

interface FormValues {
  relationship: string
  firstName: string
  lastName: string
  phone: string
  email: string
  notes: string
}

const EMPTY_FORM: FormValues = {
  relationship: '',
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  notes: '',
}

export function AdditionalContactsCard({ subjectType, subjectId }: Props) {
  const [contacts, setContacts] = useState<AdditionalContactRow[]>([])
  const [loading, setLoading] = useState(true)
  const [contactTypes, setContactTypes] = useState<string[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormValues>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [dupeWarning, setDupeWarning] = useState<DupeWarning>(null)
  const [dupeAcknowledged, setDupeAcknowledged] = useState(false)

  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/additional-contacts?subjectType=${subjectType}&subjectId=${subjectId}`,
      )
      if (!res.ok) throw new Error()
      const json = await res.json()
      setContacts(json.data ?? [])
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }, [subjectType, subjectId])

  const fetchTypes = useCallback(async () => {
    try {
      const res = await fetch('/api/contact-types')
      if (!res.ok) throw new Error()
      const json = await res.json()
      setContactTypes(json.data ?? [])
    } catch {
      /* silent */
    }
  }, [])

  useEffect(() => {
    fetchContacts()
    fetchTypes()
  }, [fetchContacts, fetchTypes])

  useEffect(() => {
    if (editingId !== null || dupeAcknowledged) return

    // 1. Local check — runs immediately (no debounce needed, data is already in state)
    const nameTrimmed = form.firstName.trim().toLowerCase()
    const lastTrimmed = form.lastName.trim().toLowerCase()
    if (nameTrimmed.length >= 2) {
      const localMatch = contacts.find(c =>
        c.firstName.toLowerCase() === nameTrimmed &&
        (c.lastName ?? '').toLowerCase() === lastTrimmed
      )
      if (localMatch) {
        setDupeWarning({ kind: 'local', existingContact: localMatch })
        return
      }
    }

    // 2. System check — debounced
    const query = nameTrimmed.length >= 2 ? form.firstName.trim() : form.phone.trim()
    const field = nameTrimmed.length >= 2 ? 'firstName' : 'phone'
    if (query.length < 2) { setDupeWarning(null); return }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/contacts/search?field=${field}&q=${encodeURIComponent(query)}`, { signal: controller.signal })
        if (!res.ok) return
        const data = await res.json()
        const matches: any[] = data.data ?? data ?? []
        if (matches.length > 0) {
          const m = matches[0]
          const role = m.buyerId ? 'Buyer' : m.vendorId ? 'Vendor' : 'Contact'
          setDupeWarning({ kind: 'system', name: `${m.firstName} ${m.lastName ?? ''}`.trim(), role, buyerId: m.buyerId, vendorId: m.vendorId })
        } else {
          setDupeWarning(null)
        }
      } catch { /* ignore abort */ }
    }, 300)

    return () => { clearTimeout(timer); controller.abort() }
  }, [form.firstName, form.lastName, form.phone, editingId, dupeAcknowledged, contacts])

  function openAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFieldErrors({})
    setDupeWarning(null)
    setDupeAcknowledged(false)
    setModalOpen(true)
  }

  function openEdit(c: AdditionalContactRow) {
    setEditingId(c.id)
    setForm({
      relationship: c.relationship,
      firstName: c.firstName,
      lastName: c.lastName ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      notes: c.notes ?? '',
    })
    setFieldErrors({})
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFieldErrors({})
    setDupeWarning(null)
    setDupeAcknowledged(false)
  }

  async function handleSave() {
    const errs: Record<string, string> = {}
    if (!form.relationship) errs.relationship = 'Relationship is required.'
    if (!form.firstName.trim()) errs.firstName = 'First Name is required.'
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      return
    }
    setFieldErrors({})
    setSaving(true)
    try {
      const url = editingId
        ? `/api/additional-contacts/${editingId}`
        : '/api/additional-contacts'
      const method = editingId ? 'PATCH' : 'POST'
      const payload: Record<string, unknown> = {
        relationship: form.relationship,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        notes: form.notes.trim() || null,
      }
      if (!editingId) {
        payload.subjectType = subjectType
        payload.subjectId = subjectId
      }
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? 'Save failed')
      }
      toast.success(editingId ? 'Contact updated.' : 'Contact added.')
      closeModal()
      fetchContacts()
    } catch (err: any) {
      toast.error(err.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this contact? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/additional-contacts/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error()
      toast.success('Contact deleted.')
      fetchContacts()
    } catch {
      toast.error('Failed to delete contact.')
    }
  }

  const inputCls = (hasErr?: boolean) =>
    `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
      hasErr
        ? 'border-red-400 ring-red-400 focus:ring-red-400'
        : 'border-gray-200 focus:ring-blue-500'
    }`

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-400" />
          Additional Contacts
        </h3>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
        >
          <UserPlus className="w-3 h-3" />
          Add Contact
        </button>
      </div>

      {loading ? (
        <div className="text-center py-6 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin inline" /> Loading...
        </div>
      ) : contacts.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">
          No additional contacts yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {contacts.map((c) => (
            <li
              key={c.id}
              className="border border-gray-100 rounded-lg p-3 hover:bg-gray-50/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {c.firstName} {c.lastName ?? ''}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700">
                      {c.relationship}
                    </span>
                  </div>
                  {c.phone && (
                    <div className="flex items-center gap-2 mt-1 text-sm">
                      <Phone className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      <span className="text-gray-700 font-mono text-[13px]">
                        {formatPhone(c.phone)}
                      </span>
                      <PhoneActions number={c.phone} />
                    </div>
                  )}
                  {c.email && (
                    <div className="flex items-center gap-2 mt-1 text-sm">
                      <Mail className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      <span className="text-gray-700 text-[13px]">{c.email}</span>
                      <EmailActions email={c.email} />
                    </div>
                  )}
                  {c.notes && (
                    <p className="text-xs text-gray-500 mt-1">{c.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEdit(c)}
                    className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-[15px] font-semibold text-gray-900">
                {editingId ? 'Edit Contact' : 'Add Contact'}
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {/* Contact Type / Relationship */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Contact Type <span className="text-rose-500">*</span>
                </label>
                <select
                  value={form.relationship}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, relationship: e.target.value }))
                    if (fieldErrors.relationship)
                      setFieldErrors((p) => ({ ...p, relationship: '' }))
                  }}
                  className={inputCls(!!fieldErrors.relationship)}
                >
                  <option value="">— Select type —</option>
                  {contactTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {fieldErrors.relationship && (
                  <p className="text-[11px] text-red-500 mt-1">
                    {fieldErrors.relationship}
                  </p>
                )}
              </div>

              {/* Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    First Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={(e) => {
                      setForm((p) => ({ ...p, firstName: e.target.value }))
                      if (fieldErrors.firstName)
                        setFieldErrors((p) => ({ ...p, firstName: '' }))
                    }}
                    className={inputCls(!!fieldErrors.firstName)}
                  />
                  {fieldErrors.firstName && (
                    <p className="text-[11px] text-red-500 mt-1">
                      {fieldErrors.firstName}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, lastName: e.target.value }))
                    }
                    className={inputCls()}
                  />
                </div>
              </div>

              {/* Duplicate Warning */}
              {dupeWarning && !dupeAcknowledged && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                  {dupeWarning.kind === 'local' ? (
                    <>
                      <p className="font-medium text-amber-800">
                        ⚠️ Already listed as an additional contact ({dupeWarning.existingContact.relationship})
                      </p>
                      <div className="flex gap-2 mt-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            closeModal()
                            openEdit(dupeWarning.existingContact)
                          }}
                          className="text-xs font-medium text-amber-700 underline"
                        >
                          Edit existing
                        </button>
                        <button
                          type="button"
                          onClick={() => setDupeAcknowledged(true)}
                          className="text-xs font-medium text-gray-500 underline"
                        >
                          Add anyway
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-amber-800">
                        ⚠️ <strong>{dupeWarning.name}</strong> already exists in the system as a {dupeWarning.role}
                      </p>
                      <div className="flex gap-2 mt-1.5">
                        {(dupeWarning.buyerId || dupeWarning.vendorId) && (
                          <button
                            type="button"
                            onClick={() => {
                              const url = dupeWarning.buyerId ? `/buyers/${dupeWarning.buyerId}` : `/vendors/${dupeWarning.vendorId}`
                              window.open(url, '_blank')
                            }}
                            className="text-xs font-medium text-amber-700 underline"
                          >
                            View profile
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDupeAcknowledged(true)}
                          className="text-xs font-medium text-gray-500 underline"
                        >
                          Add anyway
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Phone */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, phone: e.target.value }))
                  }
                  placeholder="(555) 555-5555"
                  className={inputCls()}
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  inputMode="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, email: e.target.value }))
                  }
                  placeholder="contact@example.com"
                  className={inputCls()}
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, notes: e.target.value }))
                  }
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {saving
                  ? 'Saving...'
                  : editingId
                    ? 'Save Changes'
                    : 'Add Contact'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
