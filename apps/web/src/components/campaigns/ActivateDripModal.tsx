'use client'

/**
 * ActivateDripModal — the "Auto Follow-up" modal a user opens from a
 * lead's action menu. Hits POST /api/campaigns/[id]/enroll with the
 * new payload shape (phoneNumberId / firstStepAt / autoStopOnReply /
 * contactScope / subjectType / subjectId).
 *
 * The spec's modal has five blocks; we keep the order intact:
 *   1. Phone picker — single dropdown that drives both outbound
 *      caller-ID and lead-source attribution. Format the spec wants
 *      is `{phone} - {leadSourceLabel} - {sourceName}` — we map this
 *      onto the TwilioNumber columns we already have.
 *   2. Select Contact (Primary / All)
 *   3. Drip Campaign picker (active drips of the lead's module)
 *   4. Change-timing toggle + (when on) duration + live preview
 *   5. Auto-stop-on-reply toggle
 */

import { useEffect, useMemo, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { DelayUnitSelect } from './DelayUnitSelect'
import { addDelay, formatPreviewTimestamp, type DelayUnit } from '@/lib/drip-preview'

type SubjectType = 'PROPERTY' | 'BUYER' | 'VENDOR'

interface PhoneOption {
  id: string
  number: string
  friendlyName: string | null
  purpose: string
}

interface CampaignOption {
  id: string
  name: string
  module: string
  steps: Array<{ delayAmount: number | null; delayUnit: string | null }>
}

interface Props {
  open: boolean
  onClose: () => void
  /** Subject being enrolled — determines which campaigns the picker shows. */
  subjectType: SubjectType
  subjectId: string
  /** Module of the subject (matches campaign.module values). */
  module: 'LEADS' | 'BUYERS' | 'VENDORS' | 'SOLD'
  /** Optional preselected phone number id — if the user already has a
   *  default for this lead we surface it. */
  defaultPhoneNumberId?: string | null
  onActivated?: (enrollmentId: string) => void
}

export function ActivateDripModal({
  open,
  onClose,
  subjectType,
  subjectId,
  module,
  defaultPhoneNumberId,
  onActivated,
}: Props) {
  const [phones, setPhones] = useState<PhoneOption[]>([])
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([])
  const [phoneId, setPhoneId] = useState<string>('')
  const [contactScope, setContactScope] = useState<'PRIMARY' | 'ALL'>('PRIMARY')
  const [campaignId, setCampaignId] = useState<string>('')
  const [overrideTiming, setOverrideTiming] = useState(false)
  const [delayAmount, setDelayAmount] = useState(1)
  const [delayUnit, setDelayUnit] = useState<DelayUnit>('DAYS')
  const [autoStopOnReply, setAutoStopOnReply] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Hydrate option lists when the modal opens.
  useEffect(() => {
    if (!open) return
    setError(null)
    setPhoneId(defaultPhoneNumberId ?? '')

    let aborted = false
    Promise.all([
      fetch('/api/phone-numbers').then((r) => r.json()).catch(() => ({ data: [] })),
      fetch(`/api/campaigns?type=DRIP&status=ACTIVE&module=${module}`)
        .then((r) => r.json())
        .catch(() => ({ rows: [] })),
    ]).then(([phRes, cRes]) => {
      if (aborted) return
      const ph = Array.isArray(phRes?.data) ? phRes.data : []
      setPhones(
        ph.map((p: any) => ({
          id: p.id,
          number: p.number,
          friendlyName: p.friendlyName ?? null,
          purpose: p.purpose ?? 'general',
        })),
      )
      const cs = Array.isArray(cRes?.rows) ? cRes.rows : []
      setCampaigns(
        cs.map((c: any) => ({
          id: c.id,
          name: c.name,
          module: c.module,
          // Steps come back as a count via _count on the list response,
          // so we need a follow-up fetch per selected campaign to read
          // the first step's delay. Stub here; the real fetch happens
          // below once the user picks one.
          steps: [],
        })),
      )
    })
    return () => {
      aborted = true
    }
  }, [open, module, defaultPhoneNumberId])

  // When the user picks a campaign, fetch its first step so we can
  // run the live preview ("the 1st step will complete on…"). The list
  // endpoint doesn't include steps, so we hit /api/campaigns/[id]
  // for the chosen one.
  useEffect(() => {
    if (!campaignId) return
    let aborted = false
    fetch(`/api/campaigns/${campaignId}`)
      .then((r) => r.json())
      .then((c) => {
        if (aborted) return
        const steps = Array.isArray(c?.steps)
          ? c.steps.map((s: any) => ({
              delayAmount: s.delayAmount,
              delayUnit: s.delayUnit,
            }))
          : []
        setCampaigns((prev) =>
          prev.map((p) => (p.id === campaignId ? { ...p, steps } : p)),
        )
      })
      .catch(() => {})
    return () => {
      aborted = true
    }
  }, [campaignId])

  const previewAt = useMemo(() => {
    if (!campaignId) return null
    if (overrideTiming) {
      return addDelay(new Date(), delayAmount, delayUnit)
    }
    // Anchor on the first step's existing delay.
    const c = campaigns.find((x) => x.id === campaignId)
    const first = c?.steps?.[0]
    if (!first || first.delayAmount == null || !first.delayUnit) return null
    return addDelay(new Date(), first.delayAmount, first.delayUnit as DelayUnit)
  }, [campaignId, campaigns, overrideTiming, delayAmount, delayUnit])

  if (!open) return null

  async function handleActivate() {
    if (!campaignId) {
      setError('Pick a drip campaign.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const firstStepAt = overrideTiming
        ? addDelay(new Date(), delayAmount, delayUnit).toISOString()
        : null
      const payload = {
        subjectType,
        subjectId,
        phoneNumberId: phoneId || null,
        firstStepAt,
        autoStopOnReply,
        contactScope,
      }
      const res = await fetch(`/api/campaigns/${campaignId}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(
          typeof err.error === 'string'
            ? err.error
            : 'Could not start the drip campaign.',
        )
      }
      const enrollment = await res.json()
      toast.success('Auto Follow-up activated.')
      onActivated?.(enrollment.id)
      onClose()
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900">
            Auto Follow-up
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Phone */}
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-2">
              Select the phone to use for your Drip Campaign{' '}
              <span className="text-rose-500">*</span>
            </label>
            <select
              value={phoneId}
              onChange={(e) => setPhoneId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Choose a phone number —</option>
              {phones.map((p) => (
                <option key={p.id} value={p.id}>
                  {formatPhoneOption(p)}
                </option>
              ))}
            </select>
          </div>

          {/* Contact scope */}
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-2">
              Select Contact
            </label>
            <div className="flex items-center gap-4">
              {(['PRIMARY', 'ALL'] as const).map((scope) => (
                <label
                  key={scope}
                  className="flex items-center gap-1.5 text-[13px] cursor-pointer"
                >
                  <input
                    type="radio"
                    name="activate-contact-scope"
                    value={scope}
                    checked={contactScope === scope}
                    onChange={() => setContactScope(scope)}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-700">
                    {scope === 'PRIMARY' ? 'Primary Contact' : 'All Contacts'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Campaign picker */}
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-2">
              Select the Drip Campaign{' '}
              <span className="text-rose-500">*</span>
            </label>
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Choose a drip campaign —</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {campaigns.length === 0 && (
              <p className="mt-1 text-[11px] text-gray-400">
                No active drip campaigns for this module yet — create one
                from the Campaigns page first.
              </p>
            )}
          </div>

          {/* Override timing */}
          <div className="border border-gray-100 rounded-lg p-3 bg-gray-50">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={overrideTiming}
                onChange={(e) => setOverrideTiming(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-[13px] font-medium text-gray-700">
                Would you like to change the timing of the 1st message?
              </span>
            </label>
            {overrideTiming && (
              <div className="mt-3 ml-6 space-y-2">
                <p className="text-[11px] text-gray-500">
                  When would you like the 1st step in this Drip Campaign to start?
                </p>
                <DelayUnitSelect
                  amount={delayAmount}
                  unit={delayUnit}
                  onChange={(next) => {
                    setDelayAmount(next.amount)
                    setDelayUnit(next.unit as DelayUnit)
                  }}
                  numberAsSelect
                  suffix="From being activated"
                />
                <p className="text-[10px] text-gray-400 italic">
                  (The timing for any step after the 1st step will get
                  updated automatically based on the new time for the 1st step.)
                </p>
              </div>
            )}
            {previewAt && (
              <div className="mt-3 px-3 py-2 bg-white border border-gray-100 rounded-lg text-[12px] text-gray-600">
                Based on your settings, the 1st step will be completed on{' '}
                <span className="font-semibold text-gray-800">
                  {formatPreviewTimestamp(previewAt)}
                </span>
                .
              </div>
            )}
          </div>

          {/* Auto-stop */}
          <div>
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoStopOnReply}
                onChange={(e) => setAutoStopOnReply(e.target.checked)}
                className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-[13px] text-gray-700 leading-relaxed">
                Auto-stop this drip when the lead replies via call or SMS.
              </span>
            </label>
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] font-medium text-gray-600 hover:text-gray-800 px-3 py-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleActivate}
            disabled={saving || !campaignId}
            className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-[13px] font-semibold rounded-lg px-4 py-2 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving ? 'Activating…' : 'Set Auto Follow-up'}
          </button>
        </div>
      </div>
    </div>
  )
}

function formatPhoneOption(p: PhoneOption): string {
  // Spec example: "(469) 639-1042 - Bulk List - Ispeedtolead".
  // We don't currently have a separate "lead source" column on the
  // number — `purpose` is the closest semantic match, and
  // friendlyName carries the human-set name.
  const formatted = formatPhone(p.number)
  const parts = [formatted]
  if (p.purpose) parts.push(p.purpose)
  if (p.friendlyName) parts.push(p.friendlyName)
  return parts.join(' - ')
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return raw
}
