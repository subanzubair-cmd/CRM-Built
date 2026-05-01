'use client'

/**
 * Merge two buyers into one. The user picks the second buyer via a
 * typeahead, sees a side-by-side comparison of every field, and
 * picks which side wins for each one (phones / emails always
 * union — no choice needed). Submit hits POST /api/buyers/merge,
 * which returns the freshly-merged buyer.
 *
 * Default keep-side is whichever buyer has more filled-in fields,
 * matching the user's spec ("default selecting the 1 with most of
 * the details").
 */

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Merge as MergeIcon, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { ContactFieldAutocomplete, type ContactMatch } from './ContactFieldAutocomplete'

interface BuyerSnapshot {
  id: string
  firstName: string
  lastName: string
  contactType: 'BUYER' | 'AGENT'
  phones: Array<{ label: string; number: string }>
  emails: Array<{ label: string; email: string }>
  mailingAddress: string
  howHeardAbout: string
  assignedUserId: string
  assignedUserName: string | null
  notes: string
  vipFlag: boolean
  targetCities: string[]
  targetZips: string[]
  targetCounties: string[]
  targetStates: string[]
  customQuestions: Record<string, unknown>
}

interface Props {
  open: boolean
  onClose: () => void
  current: BuyerSnapshot
}

type Side = 'keep' | 'merge'

// Fields that aren't unioned (phones/emails are auto-unioned). The
// matrix shows two columns + a radio per row picking which side
// wins. Default is "keep" (current buyer) but if the merge buyer's
// value is set and current's is empty, we flip the default.
const FIELDS: Array<{ key: keyof BuyerSnapshot; label: string }> = [
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName', label: 'Last Name' },
  { key: 'contactType', label: 'Contact Type' },
  { key: 'mailingAddress', label: 'Mailing Address' },
  { key: 'howHeardAbout', label: 'How Heard About Us' },
  { key: 'assignedUserId', label: 'Owner' },
  { key: 'vipFlag', label: 'VIP' },
  { key: 'notes', label: 'Notes' },
  { key: 'targetCities', label: 'Target Cities' },
  { key: 'targetZips', label: 'Target Zips' },
  { key: 'targetCounties', label: 'Target Counties' },
  { key: 'targetStates', label: 'Target States' },
  { key: 'customQuestions', label: 'Buyer Preferences' },
]

function isEmpty(v: unknown): boolean {
  if (v == null || v === '' || v === false) return true
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.keys(v as object).length === 0
  return false
}

function fmt(v: unknown): string {
  if (isEmpty(v)) return '—'
  if (Array.isArray(v)) return v.join(', ')
  if (v === true) return 'Yes'
  if (v === false) return 'No'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function countFilled(b: BuyerSnapshot | null): number {
  if (!b) return 0
  let n = 0
  for (const f of FIELDS) if (!isEmpty(b[f.key])) n++
  if ((b.phones ?? []).length > 0) n++
  if ((b.emails ?? []).length > 0) n++
  return n
}

export function MergeBuyersModal({ open, onClose, current }: Props) {
  const router = useRouter()
  const [other, setOther] = useState<BuyerSnapshot | null>(null)
  const [otherLoading, setOtherLoading] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [picks, setPicks] = useState<Record<string, Side>>({})
  const [keepSide, setKeepSide] = useState<Side>('keep') // which buyer SURVIVES
  const [merging, setMerging] = useState(false)

  // Flip the keep side based on filled-field count once the other
  // buyer loads. Lots of detail wins.
  useEffect(() => {
    if (!other) return
    setKeepSide(countFilled(other) > countFilled(current) ? 'merge' : 'keep')
    // Default each per-field pick to whichever side has a value.
    const next: Record<string, Side> = {}
    for (const f of FIELDS) {
      const a = current[f.key]
      const b = other[f.key]
      if (isEmpty(a) && !isEmpty(b)) next[f.key as string] = 'merge'
      else next[f.key as string] = 'keep'
    }
    setPicks(next)
  }, [other, current])

  async function loadOther(buyerId: string) {
    setOtherLoading(true)
    try {
      const r = await fetch(`/api/buyers/${buyerId}`)
      const j = await r.json()
      const b = j?.data
      if (!b) {
        toast.error('Could not load that buyer.')
        return
      }
      setOther({
        id: b.id,
        firstName: b.contact?.firstName ?? '',
        lastName: b.contact?.lastName ?? '',
        contactType: b.contact?.type === 'AGENT' ? 'AGENT' : 'BUYER',
        phones: Array.isArray(b.contact?.phones) ? b.contact.phones : [],
        emails: Array.isArray(b.contact?.emails) ? b.contact.emails : [],
        mailingAddress: b.contact?.mailingAddress ?? '',
        howHeardAbout: b.contact?.howHeardAbout ?? '',
        assignedUserId: b.contact?.assignedUserId ?? '',
        assignedUserName: null,
        notes: b.notes ?? '',
        vipFlag: !!b.vipFlag,
        targetCities: b.targetCities ?? [],
        targetZips: b.targetZips ?? [],
        targetCounties: b.targetCounties ?? [],
        targetStates: b.targetStates ?? [],
        customQuestions: b.customQuestions ?? {},
      })
    } catch {
      toast.error('Failed to load buyer.')
    } finally {
      setOtherLoading(false)
    }
  }

  async function submit() {
    if (!other) return
    setMerging(true)
    try {
      const keepBuyer = keepSide === 'keep' ? current : other
      const mergeBuyer = keepSide === 'keep' ? other : current

      // Build the `fields` map by walking each field — apply the
      // user's pick relative to keep/merge. The API treats omitted
      // keys as "use keep", so we only emit overrides where the
      // pick disagrees with keepSide.
      const fields: Record<string, unknown> = {}
      for (const f of FIELDS) {
        const pick = picks[f.key as string] ?? 'keep'
        const winner = pick === 'keep' ? current : other
        if (winner.id === keepBuyer.id) continue
        fields[f.key as string] = winner[f.key]
      }
      // contactType is always a strict 'BUYER' | 'AGENT' — coerce.
      if ('contactType' in fields) {
        fields.contactType = fields.contactType ?? 'BUYER'
      }

      const res = await fetch('/api/buyers/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keepId: keepBuyer.id,
          mergeId: mergeBuyer.id,
          fields,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(typeof j.error === 'string' ? j.error : 'Merge failed.')
      }
      toast.success('Merged.')
      router.push(`/buyers/${keepBuyer.id}`)
      router.refresh()
      onClose()
    } catch (e: any) {
      toast.error(e.message ?? 'Merge failed.')
    } finally {
      setMerging(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-gray-100 z-10">
          <h2 className="text-[15px] font-semibold text-gray-900 flex items-center gap-2">
            <MergeIcon className="w-4 h-4 text-blue-500" />
            Merge Buyers
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!other ? (
            <div>
              <p className="text-[13px] text-gray-600 mb-2">
                Pick the second buyer to merge with{' '}
                <span className="font-semibold text-gray-900">
                  {[current.firstName, current.lastName].filter(Boolean).join(' ') ||
                    'this buyer'}
                </span>
                . All unique phone numbers and emails from both are kept; for every
                other field you'll choose which value wins.
              </p>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
                <ContactFieldAutocomplete
                  value={searchValue}
                  onChange={setSearchValue}
                  field="firstName"
                  type="BUYER"
                  inputClassName="input w-full pl-8"
                  placeholder="Search by name, phone, or email…"
                  onSelectMatch={(m: ContactMatch) => {
                    if (!m.buyerId) return
                    if (m.buyerId === current.id) {
                      toast.error("You can't merge a buyer with itself.")
                      return
                    }
                    loadOther(m.buyerId)
                  }}
                />
              </div>
              {otherLoading && (
                <p className="text-[12px] text-gray-400 italic mt-2">
                  <Loader2 className="w-3 h-3 animate-spin inline" /> Loading…
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-[12px] text-blue-800">
                Phones and emails will be <strong>unioned</strong> across both
                buyers (deduped on the value). For every other field, pick which
                side&apos;s value wins. The default choice is{' '}
                <strong>{keepSide === 'keep' ? 'this buyer' : 'the merged-in buyer'}</strong>{' '}
                because it has more filled-in fields ({countFilled(keepSide === 'keep' ? current : other)} vs{' '}
                {countFilled(keepSide === 'keep' ? other : current)}).
              </div>

              {/* Survivor toggle */}
              <div className="flex items-center justify-center gap-3 text-[12px]">
                <span className="text-gray-500">Keep which buyer:</span>
                {(['keep', 'merge'] as const).map((s) => {
                  const buyer = s === 'keep' ? current : other
                  const label =
                    [buyer.firstName, buyer.lastName].filter(Boolean).join(' ') ||
                    'unnamed'
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setKeepSide(s)}
                      className={`px-3 py-1 rounded-full font-medium ${
                        keepSide === s
                          ? 'bg-emerald-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>

              {/* Side-by-side matrix */}
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-gray-50/60 border-b border-gray-100">
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-44">
                        Field
                      </th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                        {[current.firstName, current.lastName]
                          .filter(Boolean)
                          .join(' ') || 'This buyer'}
                      </th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                        {[other.firstName, other.lastName].filter(Boolean).join(' ') ||
                          'Merged-in buyer'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {FIELDS.map((f) => {
                      const a = current[f.key]
                      const b = other[f.key]
                      const same = JSON.stringify(a) === JSON.stringify(b)
                      const sel = picks[f.key as string] ?? 'keep'
                      return (
                        <tr key={f.key as string}>
                          <td className="px-3 py-2 align-top text-gray-500 font-medium">
                            {f.label}
                          </td>
                          <td className="px-3 py-2 align-top">
                            <label className="flex items-start gap-1.5 cursor-pointer">
                              <input
                                type="radio"
                                checked={sel === 'keep'}
                                onChange={() =>
                                  setPicks((p) => ({ ...p, [f.key as string]: 'keep' }))
                                }
                                disabled={same || isEmpty(a)}
                                className="mt-0.5 text-blue-600"
                              />
                              <span className={isEmpty(a) ? 'text-gray-300' : 'text-gray-800'}>
                                {fmt(a)}
                              </span>
                            </label>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <label className="flex items-start gap-1.5 cursor-pointer">
                              <input
                                type="radio"
                                checked={sel === 'merge'}
                                onChange={() =>
                                  setPicks((p) => ({ ...p, [f.key as string]: 'merge' }))
                                }
                                disabled={same || isEmpty(b)}
                                className="mt-0.5 text-blue-600"
                              />
                              <span className={isEmpty(b) ? 'text-gray-300' : 'text-gray-800'}>
                                {fmt(b)}
                              </span>
                            </label>
                          </td>
                        </tr>
                      )
                    })}
                    <tr className="bg-emerald-50/40">
                      <td className="px-3 py-2 align-top text-emerald-700 font-semibold">
                        Phones (unioned)
                      </td>
                      <td colSpan={2} className="px-3 py-2 text-gray-700">
                        {[
                          ...current.phones.map((p) => p.number),
                          ...other.phones.map((p) => p.number),
                        ]
                          .filter((v, i, arr) => arr.indexOf(v) === i)
                          .join(', ') || '—'}
                      </td>
                    </tr>
                    <tr className="bg-emerald-50/40">
                      <td className="px-3 py-2 align-top text-emerald-700 font-semibold">
                        Emails (unioned)
                      </td>
                      <td colSpan={2} className="px-3 py-2 text-gray-700">
                        {[
                          ...current.emails.map((e) => e.email),
                          ...other.emails.map((e) => e.email),
                        ]
                          .filter((v, i, arr) => arr.indexOf(v) === i)
                          .join(', ') || '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
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
            disabled={!other || merging}
            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold rounded-lg px-4 py-2 disabled:opacity-50"
          >
            {merging && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {merging ? 'Merging…' : 'Merge'}
          </button>
        </div>
      </div>
    </div>
  )
}
