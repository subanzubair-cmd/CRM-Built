'use client'

/**
 * Buyer / Agent add+edit form — replaces the old AddBuyerModal.
 * Matches the Buyers Module spec sections:
 *
 *   PERSONAL INFO
 *     - First Name *, Last Name
 *     - Contact Type * radio: Buyer | Agent
 *     - Email, Phone, Company (notes for now)
 *     - How did you hear about us?
 *     - Who Owns this Buyer Contact * (disposition-role users only)
 *     - Mailing Address
 *     - Secondary Phones[] / Secondary Emails[] with +Add and trash
 *
 *   TARGET GEOGRAPHY
 *     - Target Cities / Zips / Counties / States — pill multi-selects
 *       seeded from /api/geography distinct values across all buyers
 *
 *   BUYER PREFERENCE (custom questions)
 *     - Authored in CustomFormConfig(entityType='buyer'); rendered as
 *       a flexible question list. Falls back to a hard-coded default
 *       set matching the spec when no config row exists.
 *
 * Usage: pass `mode='create'` to add or `mode='edit'` with `buyerId`
 * + initial values to update.
 */

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { ContactFieldAutocomplete } from './ContactFieldAutocomplete'
import { DuplicateWarningModal } from '@/components/ui/DuplicateWarningModal'
import { DuplicateInlineWarning } from '@/components/ui/DuplicateInlineWarning'
import { useDuplicateCheck } from '@/hooks/useDuplicateCheck'

interface PhoneRow {
  label: string
  number: string
}
interface EmailRow {
  label: string
  email: string
}

interface BuyerFormValues {
  firstName: string
  lastName: string
  contactType: 'BUYER' | 'AGENT'
  phones: PhoneRow[]
  emails: EmailRow[]
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
}

const EMPTY: BuyerFormValues = {
  firstName: '',
  lastName: '',
  contactType: 'BUYER',
  phones: [{ label: 'Mobile', number: '' }],
  emails: [{ label: 'Primary', email: '' }],
  mailingAddress: '',
  howHeardAbout: '',
  assignedUserId: '',
  notes: '',
  targetCities: [],
  targetZips: [],
  targetCounties: [],
  targetStates: [],
  customQuestions: {},
  vipFlag: false,
}

/** Field-level error keys. */
type FieldErrorKey = 'firstName' | 'contact' | 'howHeardAbout' | 'assignedUserId'

interface Props {
  open: boolean
  onClose: () => void
  /** When set, the modal opens in edit mode for this buyer id. */
  buyerId?: string
  initial?: Partial<BuyerFormValues>
}

export function BuyerFormModal({ open, onClose, buyerId, initial }: Props) {
  const router = useRouter()
  const [values, setValues] = useState<BuyerFormValues>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldErrorKey, string>>>({})
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([])
  const [dup, setDup] = useState<{ message: string; existingBuyerId: string } | null>(null)
  /** Contact id of the buyer being edited — used to exclude self from duplicate checks. */
  const [editContactId, setEditContactId] = useState<string | null>(null)

  const [buyerSources, setBuyerSources] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    setValues({ ...EMPTY, ...(initial ?? {}) })
    setError(null)
    setFieldErrors({})
    setDup(null)
    // In edit mode, fetch the buyer to get the contact id for
    // self-exclusion in duplicate checks.
    if (buyerId) {
      fetch(`/api/buyers/${buyerId}`)
        .then((r) => r.json())
        .then((res) => {
          if (res?.data?.contactId) setEditContactId(res.data.contactId)
        })
        .catch(() => {})
    } else {
      setEditContactId(null)
    }
    fetch('/api/users?withDispositionRole=true')
      .then((r) => r.json())
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : []
        setUsers(list.map((u: any) => ({ id: u.id, name: u.name })))
      })
      .catch(() => {})
    // Load buyer sources for the "How did you hear about us?" dropdown
    fetch('/api/contact-sources?type=buyer')
      .then((r) => r.json())
      .then((res) => setBuyerSources(Array.isArray(res?.data) ? res.data : []))
      .catch(() => {})
  }, [open, initial])

  if (!open) return null

  const isEdit = !!buyerId

  function patch<K extends keyof BuyerFormValues>(key: K, value: BuyerFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
    // Clear field-level error when user edits the field.
    if (key === 'firstName' && fieldErrors.firstName) {
      setFieldErrors((prev) => ({ ...prev, firstName: undefined }))
    }
    if (key === 'howHeardAbout' && fieldErrors.howHeardAbout) {
      setFieldErrors((prev) => ({ ...prev, howHeardAbout: undefined }))
    }
    if (key === 'assignedUserId' && fieldErrors.assignedUserId) {
      setFieldErrors((prev) => ({ ...prev, assignedUserId: undefined }))
    }
    if ((key === 'phones' || key === 'emails') && fieldErrors.contact) {
      setFieldErrors((prev) => ({ ...prev, contact: undefined }))
    }
  }

  async function submit() {
    // Validate all required fields at once.
    const errs: Partial<Record<FieldErrorKey, string>> = {}
    if (!values.firstName.trim()) errs.firstName = 'First Name is required.'
    const hasPhone = values.phones.some((p) => p.number.trim())
    const hasEmail = values.emails.some((e) => e.email.trim())
    if (!hasPhone && !hasEmail) errs.contact = 'At least one phone number or email is required.'
    if (!values.howHeardAbout) errs.howHeardAbout = 'This field is required.'
    if (!values.assignedUserId) errs.assignedUserId = 'This field is required.'

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      setError(null)
      return
    }

    setFieldErrors({})
    setSaving(true)
    setError(null)
    try {
      const payload = {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim() || undefined,
        contactType: values.contactType,
        phones: values.phones.filter((p) => p.number.trim()),
        emails: values.emails.filter((e) => e.email.trim()),
        mailingAddress: values.mailingAddress || undefined,
        howHeardAbout: values.howHeardAbout || undefined,
        assignedUserId: values.assignedUserId || null,
        notes: values.notes || undefined,
        targetCities: values.targetCities,
        targetZips: values.targetZips,
        targetCounties: values.targetCounties,
        targetStates: values.targetStates,
        customQuestions: values.customQuestions,
        vipFlag: values.vipFlag,
      }
      const res = await fetch(isEdit ? `/api/buyers/${buyerId}` : '/api/buyers', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409 && data.existingBuyerId) {
          setDup({ message: data.error, existingBuyerId: data.existingBuyerId })
          return
        }
        setError(typeof data.error === 'string' ? data.error : 'Failed to save.')
        return
      }
      toast.success(isEdit ? 'Buyer updated.' : 'Buyer added.')
      onClose()
      if (!isEdit && data?.data?.id) {
        router.push(`/buyers/${data.data.id}`)
      } else {
        router.refresh()
      }
    } catch (e: any) {
      setError(e.message ?? 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-gray-100 z-10">
          <h2 className="text-[15px] font-semibold text-gray-900">
            {isEdit ? 'Edit Buyer / Agent' : 'Add Buyer / Agent'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* PERSONAL INFO */}
          <section>
            <h3 className="text-[12px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Personal Info
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First Name" required error={fieldErrors.firstName}>
                <ContactFieldAutocomplete
                  value={values.firstName}
                  onChange={(v) => patch('firstName', v)}
                  field="firstName"
                  type="BUYER"
                  inputClassName={`input w-full ${fieldErrors.firstName ? '!border-red-400 !ring-red-400' : ''}`}
                  autoComplete="given-name"
                />
              </Field>
              <Field label="Last Name">
                <ContactFieldAutocomplete
                  value={values.lastName}
                  onChange={(v) => patch('lastName', v)}
                  field="lastName"
                  type="BUYER"
                  inputClassName="input w-full"
                  autoComplete="family-name"
                />
              </Field>
              <Field label="Contact Type" required>
                <div className="flex items-center gap-4 mt-1">
                  {(['BUYER', 'AGENT'] as const).map((t) => (
                    <label key={t} className="flex items-center gap-1.5 text-[13px] cursor-pointer">
                      <input
                        type="radio"
                        name="contactType"
                        checked={values.contactType === t}
                        onChange={() => patch('contactType', t)}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-gray-700">
                        {t === 'BUYER' ? 'Buyer' : 'Agent'}
                        {t === 'AGENT' && (
                          <span className="text-[10px] text-gray-400 ml-1">(of buyer)</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="VIP Buyer">
                <label className="flex items-center gap-1.5 text-[13px] cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    checked={values.vipFlag}
                    onChange={(e) => patch('vipFlag', e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-600">Mark as VIP</span>
                </label>
              </Field>

              <Field label="How did you hear about us?" required error={fieldErrors.howHeardAbout}>
                <select
                  value={values.howHeardAbout}
                  onChange={(e) => patch('howHeardAbout', e.target.value)}
                  className={`input w-full ${fieldErrors.howHeardAbout ? '!border-red-400 !ring-red-400' : ''}`}
                >
                  <option value="">— Select source —</option>
                  {buyerSources.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Who Owns this Buyer Contact" required error={fieldErrors.assignedUserId}>
                <select
                  value={values.assignedUserId}
                  onChange={(e) => patch('assignedUserId', e.target.value)}
                  className={`input w-full ${fieldErrors.assignedUserId ? '!border-red-400 !ring-red-400' : ''}`}
                >
                  <option value="">— Select assignee —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="mt-3">
              <Field label="Mailing Address">
                <input
                  value={values.mailingAddress}
                  onChange={(e) => patch('mailingAddress', e.target.value)}
                  className="input w-full"
                />
              </Field>
            </div>

            <MultiContactRows
              label="Phone *"
              addLabel="+ Add Phone"
              rows={values.phones}
              onChange={(next) => patch('phones', next)}
              placeholder="(555) 555-5555"
              field="number"
              contactType={values.contactType}
              excludeContactId={editContactId ?? undefined}
              hasError={!!fieldErrors.contact}
            />
            <MultiContactRows
              label="Email *"
              addLabel="+ Add Email"
              rows={values.emails as any[]}
              onChange={(next) => patch('emails', next as any)}
              placeholder="contact@example.com"
              field="email"
              contactType={values.contactType}
              excludeContactId={editContactId ?? undefined}
              hasError={!!fieldErrors.contact}
            />
            {fieldErrors.contact ? (
              <p className="text-[11px] text-red-500 mt-1">{fieldErrors.contact}</p>
            ) : (
              <p className="text-[10px] text-gray-400 mt-1 italic">
                At least one phone number or email is required.
              </p>
            )}
          </section>

          {/* TARGET GEOGRAPHY */}
          <section>
            <h3 className="text-[12px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Target Geography
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <GeoMultiSelect
                kind="city"
                label="Target Cities"
                values={values.targetCities}
                onChange={(v) => patch('targetCities', v)}
              />
              <GeoMultiSelect
                kind="zip"
                label="Target Zips"
                values={values.targetZips}
                onChange={(v) => patch('targetZips', v)}
              />
              <GeoMultiSelect
                kind="county"
                label="Target Counties"
                values={values.targetCounties}
                onChange={(v) => patch('targetCounties', v)}
              />
              <GeoMultiSelect
                kind="state"
                label="Target States"
                values={values.targetStates}
                onChange={(v) => patch('targetStates', v)}
              />
            </div>
          </section>

          {/* BUYER PREFERENCE (custom questions) */}
          <section>
            <h3 className="text-[12px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Buyer Preference
            </h3>
            <BuyerCustomQuestions
              answers={values.customQuestions}
              onChange={(v) => patch('customQuestions', v)}
            />
          </section>

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] font-medium text-gray-600 hover:text-gray-800 px-3 py-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-[13px] font-semibold rounded-lg px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving
              ? 'Saving…'
              : isEdit
                ? 'Save Changes'
                : values.contactType === 'AGENT'
                  ? 'Add Agent'
                  : 'Add Buyer'}
          </button>
        </div>
      </div>

      {dup && (
        <DuplicateWarningModal
          type="buyer"
          message={dup.message}
          existingId={dup.existingBuyerId}
          viewUrl={`/buyers/${dup.existingBuyerId}`}
          onClose={() => setDup(null)}
        />
      )}

      {/*
        NOTE: width is intentionally NOT set on .input here. Earlier
        the global rule forced width: 100% which collapsed the
        multi-row layout (label select + phone/email value + delete
        button), since Tailwind's w-28 / flex-1 lost specificity to
        the :global width: 100%. Standalone .input usages get an
        explicit `w-full` Tailwind class instead, and the multi-row
        ones use w-28 / flex-1 inline.
      */}
      <style jsx>{`
        :global(.input) {
          min-width: 0;
          border: 1px solid rgb(229, 231, 235);
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 13px;
          outline: none;
        }
        :global(.input:focus) {
          box-shadow: 0 0 0 2px rgb(59, 130, 246);
        }
        :global(.input.\!border-red-400) {
          border-color: rgb(248, 113, 113) !important;
        }
        :global(.input.\!border-red-400:focus) {
          box-shadow: 0 0 0 2px rgb(248, 113, 113) !important;
        }
      `}</style>
    </div>
  )
}

function Field({
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
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </div>
  )
}

/** Predefined label options for a phone/email row, matching common
 *  contact-app conventions. We don't enforce these at the DB layer
 *  (the column is JSONB free-form) so an admin power user can still
 *  type a custom label via the trailing "Custom…" entry.
 */
const PHONE_LABEL_OPTIONS = ['Mobile', 'Home', 'Work', 'Office', 'Fax', 'Other'] as const
const EMAIL_LABEL_OPTIONS = ['Primary', 'Work', 'Personal', 'Other'] as const

/**
 * Generic +Add / row-trash UI for the phones[] and emails[] arrays.
 *
 * `field` indicates the value-bearing key on each row ('number' or
 * 'email'). The label is selected from a fixed set per field type,
 * and the value input uses the matching HTML5 input type so phones
 * trigger the tel keyboard on mobile + emails get email-format
 * validation in-browser.
 *
 * Mutation is non-destructive — empty rows aren't filtered here, so
 * a partially typed row survives keystroke-level re-renders. Empty
 * rows are dropped at submit.
 */
function MultiContactRows<K extends 'number' | 'email'>({
  label,
  addLabel,
  rows,
  onChange,
  placeholder,
  field,
  contactType,
  excludeContactId,
  hasError,
}: {
  label: string
  addLabel: string
  rows: any[]
  onChange: (next: any[]) => void
  placeholder: string
  field: K
  contactType?: 'BUYER' | 'AGENT' | 'VENDOR'
  excludeContactId?: string
  hasError?: boolean
}) {
  const labelOptions =
    field === 'number' ? PHONE_LABEL_OPTIONS : EMAIL_LABEL_OPTIONS
  const defaultNewLabel =
    field === 'number' ? 'Mobile' : 'Work' // primary already exists on row 0

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1.5">
        <label className={`block text-[11px] font-semibold uppercase tracking-wide ${hasError ? 'text-red-500' : 'text-gray-500'}`}>
          {label}
        </label>
        <button
          type="button"
          onClick={() => onChange([...rows, { label: defaultNewLabel, [field]: '' }])}
          className="text-[12px] text-blue-600 hover:text-blue-700 font-semibold"
        >
          {addLabel}
        </button>
      </div>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <ContactRow
            key={i}
            row={row}
            index={i}
            rows={rows}
            onChange={onChange}
            field={field}
            label={label}
            placeholder={placeholder}
            labelOptions={labelOptions as readonly string[]}
            contactType={contactType}
            excludeContactId={excludeContactId}
            hasError={hasError}
          />
        ))}
      </div>
    </div>
  )
}

/** Individual phone/email row — extracted so useDuplicateCheck is
 *  called at a stable hook site (one per row) instead of inside a
 *  .map() loop which would violate React's rules of hooks. */
function ContactRow({
  row,
  index,
  rows,
  onChange,
  field,
  label,
  placeholder,
  labelOptions,
  contactType,
  excludeContactId,
  hasError,
}: {
  row: any
  index: number
  rows: any[]
  onChange: (next: any[]) => void
  field: 'number' | 'email'
  label: string
  placeholder: string
  labelOptions: readonly string[]
  contactType?: 'BUYER' | 'AGENT' | 'VENDOR'
  excludeContactId?: string
  hasError?: boolean
}) {
  const currentLabel: string = row.label ?? labelOptions[0]
  const matchedOption = labelOptions.find(
    (o) => o.toLowerCase() === String(currentLabel).toLowerCase(),
  )
  const isCustomLabel = !matchedOption
  const inputType = field === 'number' ? 'tel' : 'email'
  const searchType: 'BUYER' | 'VENDOR' = contactType === 'VENDOR' ? 'VENDOR' : 'BUYER'
  const dupField = field === 'number' ? 'phone' : 'email'

  const { match: dupMatch } = useDuplicateCheck({
    value: row[field] ?? '',
    field: dupField as 'phone' | 'email',
    type: searchType,
    excludeContactId,
  })

  const errorBorder = hasError ? '!border-red-400 !ring-red-400' : ''

  return (
    <div>
      <div className="flex items-center gap-2">
        <select
          value={isCustomLabel ? '__custom__' : (matchedOption as string)}
          onChange={(e) => {
            const next = [...rows]
            if (e.target.value === '__custom__') {
              next[index] = { ...next[index], label: '' }
            } else {
              next[index] = { ...next[index], label: e.target.value }
            }
            onChange(next)
          }}
          className={`input w-28 flex-shrink-0 bg-white ${errorBorder}`}
          aria-label={`${label} row ${index + 1} type`}
        >
          {labelOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
          <option value="__custom__">Custom…</option>
        </select>
        {isCustomLabel && (
          <input
            value={currentLabel}
            onChange={(e) => {
              const next = [...rows]
              next[index] = { ...next[index], label: e.target.value }
              onChange(next)
            }}
            placeholder="Custom label"
            className={`input w-28 flex-shrink-0 ${errorBorder}`}
            aria-label="Custom label name"
          />
        )}
        <div className="flex-1 min-w-0">
          <ContactFieldAutocomplete
            value={row[field] ?? ''}
            onChange={(v) => {
              const next = [...rows]
              next[index] = { ...next[index], [field]: v }
              onChange(next)
            }}
            field={field === 'number' ? 'phone' : 'email'}
            type={searchType}
            placeholder={placeholder}
            inputClassName={`input w-full ${errorBorder}`}
            inputType={inputType as 'tel' | 'email'}
            inputMode={field === 'number' ? 'tel' : 'email'}
            autoComplete={field === 'number' ? 'tel' : 'email'}
          />
        </div>
        {rows.length > 1 && (
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, idx) => idx !== index))}
            className="text-gray-400 hover:text-red-500 p-1 flex-shrink-0"
            aria-label={`Remove ${label.toLowerCase()} row`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {dupMatch && (
        <DuplicateInlineWarning
          type={searchType === 'VENDOR' ? 'vendor' : 'buyer'}
          match={dupMatch}
          fieldLabel={field === 'number' ? 'phone number' : 'email'}
        />
      )}
    </div>
  )
}

function GeoMultiSelect({
  kind,
  label,
  values,
  onChange,
}: {
  kind: 'city' | 'zip' | 'county' | 'state'
  label: string
  values: string[]
  onChange: (v: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])

  useEffect(() => {
    if (!draft.trim()) {
      setSuggestions([])
      return
    }
    const ctrl = new AbortController()
    fetch(`/api/geography?kind=${kind}&q=${encodeURIComponent(draft)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((res) =>
        setSuggestions(
          (Array.isArray(res?.values) ? res.values : []).filter(
            (v: string) => !values.includes(v),
          ),
        ),
      )
      .catch(() => {})
    return () => ctrl.abort()
  }, [draft, kind, values])

  function commit(value: string) {
    const t = value.trim()
    if (!t) return
    if (values.includes(t)) return
    onChange([...values, t])
    setDraft('')
  }

  return (
    <Field label={label}>
      <div className="relative">
        <div className="flex flex-wrap items-center gap-1.5 border border-gray-200 rounded-lg px-2 py-1 focus-within:ring-2 focus-within:ring-blue-500">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[12px] font-medium rounded px-2 py-0.5"
            >
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="text-blue-400 hover:text-blue-700"
                aria-label={`Remove ${v}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                commit(draft)
              } else if (e.key === 'Backspace' && !draft && values.length) {
                onChange(values.slice(0, -1))
              }
            }}
            onBlur={() => commit(draft)}
            placeholder={values.length === 0 ? `Click here to select from a list of ${kind}s` : ''}
            className="flex-1 min-w-[100px] text-sm border-none focus:outline-none focus:ring-0 px-1 py-1"
          />
        </div>
        {suggestions.length > 0 && (
          <div className="absolute left-0 right-0 z-10 mt-1 bg-white border border-gray-200 rounded-lg shadow-md max-h-40 overflow-y-auto">
            {suggestions.slice(0, 8).map((s) => (
              <button
                key={s}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  commit(s)
                }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 hover:text-blue-700"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </Field>
  )
}

/**
 * Default Buyer Preference question set, lifted from the spec
 * screenshots. The schema is intentionally JSON-shaped so a future
 * Settings → Buyer Form admin page can extend / replace this without
 * a code change. Answers persist on Buyer.customQuestions keyed by
 * the question's `id`.
 */
const DEFAULT_QUESTIONS = [
  {
    id: 'kindOfProperties',
    label: 'What kind of properties are you interested in?',
    type: 'multi-checkbox',
    options: ['Single Family Homes', '2-4 units', 'Condos / Townhomes', 'Large Multifamily (5+)', 'Land'],
  },
  {
    id: 'exitStrategies',
    label: "What's exit strategies do you do?",
    type: 'multi-checkbox',
    options: ['Wholesale', 'Fix and Flip', 'Rental', 'BRRRR', 'New Construction', 'Wholetail'],
  },
  {
    id: 'dealsAimingThisYear',
    label: "No. of deals are you're aiming this year?",
    type: 'number',
  },
  {
    id: 'proofOfFunds',
    label: 'Do you have proof of funds?',
    type: 'yes-no',
  },
  {
    id: 'howSoonClose',
    label: 'How soon can you close?',
    type: 'single-choice',
    options: ['1 week', '1-2 weeks', '2-3 weeks', 'More than 3 weeks'],
  },
  {
    id: 'idealPriceRange',
    label: "What's your ideal price range?",
    type: 'single-choice',
    options: ['Less than $100,000', '$100k-200k', '$200k-300k', '$300k-500k', '$500k-1M', 'More than 1M'],
  },
  {
    id: 'bestWayToSendDeal',
    label: "What's the best way to send you a deal?",
    type: 'multi-checkbox',
    options: ['Phone Call', 'Text', 'Email'],
  },
] as const

function BuyerCustomQuestions({
  answers,
  onChange,
}: {
  answers: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
}) {
  function set(id: string, value: unknown) {
    onChange({ ...answers, [id]: value })
  }

  return (
    <div className="space-y-3">
      {DEFAULT_QUESTIONS.map((q) => (
        <div key={q.id} className="bg-gray-50 border border-gray-100 rounded-lg p-3">
          <p className="text-[13px] font-medium text-gray-700 mb-2">{q.label}</p>
          {q.type === 'multi-checkbox' && (
            <div className="grid grid-cols-2 gap-1.5">
              {q.options.map((opt) => {
                const cur = (answers[q.id] as string[] | undefined) ?? []
                const checked = cur.includes(opt)
                return (
                  <label key={opt} className="flex items-center gap-1.5 text-[12px] text-gray-700">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = checked ? cur.filter((c) => c !== opt) : [...cur, opt]
                        set(q.id, next)
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    {opt}
                  </label>
                )
              })}
            </div>
          )}
          {q.type === 'single-choice' && (
            <div className="grid grid-cols-2 gap-1.5">
              {q.options.map((opt) => (
                <label key={opt} className="flex items-center gap-1.5 text-[12px] text-gray-700">
                  <input
                    type="radio"
                    name={q.id}
                    checked={answers[q.id] === opt}
                    onChange={() => set(q.id, opt)}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  {opt}
                </label>
              ))}
            </div>
          )}
          {q.type === 'yes-no' && (
            <div className="flex items-center gap-4">
              {['Yes', 'No'].map((opt) => (
                <label key={opt} className="flex items-center gap-1.5 text-[12px] text-gray-700">
                  <input
                    type="radio"
                    name={q.id}
                    checked={answers[q.id] === opt}
                    onChange={() => set(q.id, opt)}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  {opt}
                </label>
              ))}
            </div>
          )}
          {q.type === 'number' && (
            <input
              type="number"
              min={0}
              value={(answers[q.id] as number) ?? ''}
              onChange={(e) => set(q.id, e.target.value === '' ? null : Number(e.target.value))}
              className="input w-full"
              placeholder={q.label}
            />
          )}
        </div>
      ))}
    </div>
  )
}
