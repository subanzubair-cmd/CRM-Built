'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Save, Globe2, Lock } from 'lucide-react'
import { toast } from 'sonner'

/**
 * GeneralSettingsPanel — Settings → General → Company Timezone.
 *
 * Admin-only write. Non-admin users see a read-only summary so they
 * understand which zone their dates are rendered in (and why their
 * laptop clock disagreeing isn't a bug).
 */

interface Props {
  /** Whether the current user has settings.manage permission. */
  canEdit: boolean
}

// Curated list of common business zones. Browser Intl supports ~600
// IANA zones — we don't expose all of them in the dropdown to avoid
// overwhelming the UI. "Other (type IANA name)" lets the operator
// type any valid zone for offices outside this list.
const COMMON_ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Africa/Cairo',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Manila',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC',
]

function describeZone(tz: string): string {
  try {
    const now = new Date()
    const offset = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    })
      .formatToParts(now)
      .find((p) => p.type === 'timeZoneName')?.value
    const time = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
    }).format(now)
    return `${offset ?? '?'} · currently ${time}`
  } catch {
    return ''
  }
}

export function GeneralSettingsPanel({ canEdit }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [timezone, setTimezone] = useState<string>('America/Chicago')
  const [customZone, setCustomZone] = useState<string>('')
  const [usingCustom, setUsingCustom] = useState<boolean>(false)
  const browserTz = useMemo(
    () => (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'),
    [],
  )

  useEffect(() => {
    let cancelled = false
    fetch('/api/settings/general')
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        const tz = j?.data?.timezone ?? 'America/Chicago'
        setTimezone(tz)
        if (!COMMON_ZONES.includes(tz)) {
          setUsingCustom(true)
          setCustomZone(tz)
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSave() {
    if (!canEdit) return
    const tz = usingCustom ? customZone.trim() : timezone
    if (!tz) {
      toast.error('Pick a timezone')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/settings/general', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: tz }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof json.error === 'string' ? json.error : 'Failed to save timezone')
        return
      }
      setTimezone(tz)
      toast.success(`CRM timezone set to ${tz}. Refresh other tabs to pick it up.`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-2xl">
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-2xl">
      <div className="flex items-center gap-2 mb-1">
        <Globe2 className="w-4 h-4 text-gray-700" />
        <h3 className="text-sm font-semibold text-gray-800">Company Timezone</h3>
        {!canEdit && (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700"
            title="Only admins can change this"
          >
            <Lock className="w-3 h-3" /> Admin only
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 leading-relaxed mb-4">
        All dates, schedules, and timestamps in the CRM are rendered in this timezone — regardless
        of where each user is physically working from. Set it to your operating-headquarters timezone
        so an agent in Karachi or Manila sees the same call-back time as an agent in Texas.
      </p>

      <div className="space-y-3">
        <div>
          <label className="text-[11px] text-gray-500">Active timezone</label>
          <p className="font-mono text-sm text-gray-900 mt-0.5">
            {timezone}
            <span className="text-gray-400 font-sans text-xs ml-2">{describeZone(timezone)}</span>
          </p>
        </div>

        <div className="border-t border-gray-100 pt-3 space-y-2">
          <label className="text-[11px] font-semibold text-gray-600">Change to</label>
          <select
            value={usingCustom ? '__custom__' : timezone}
            onChange={(e) => {
              if (e.target.value === '__custom__') {
                setUsingCustom(true)
                setCustomZone(timezone)
              } else {
                setUsingCustom(false)
                setTimezone(e.target.value)
              }
            }}
            disabled={!canEdit}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
          >
            {COMMON_ZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz} — {describeZone(tz)}
              </option>
            ))}
            <option value="__custom__">— Other (enter IANA name) —</option>
          </select>
          {usingCustom && (
            <input
              type="text"
              value={customZone}
              onChange={(e) => setCustomZone(e.target.value)}
              disabled={!canEdit}
              placeholder="e.g. Asia/Manila or Africa/Lagos"
              className="w-full text-sm font-mono border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            />
          )}
          <p className="text-[10px] text-gray-400">
            Your browser is currently in <span className="font-mono">{browserTz}</span>. The CRM
            zone above wins regardless.
          </p>
        </div>

        {canEdit && (
          <div className="pt-3 border-t border-gray-100">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 transition-colors active:scale-95"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
