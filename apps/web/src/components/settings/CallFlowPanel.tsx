'use client'

import { useEffect, useState } from 'react'
import { Loader2, Save, PhoneCall, Lock, PhoneOff, Phone } from 'lucide-react'
import { toast } from 'sonner'

/**
 * CallFlowPanel — Settings → Call Flow.
 *
 * For now this panel exposes a single live setting:
 *   • Reject Behavior — choose between "soft" (CRM dismiss only,
 *     caller keeps ringing) and "hard" (actually hang up at Telnyx so
 *     the caller's device disconnects immediately).
 *
 * The full call-flow editor (business hours, IVR, multi-agent ringing)
 * lives below as a "coming soon" placeholder so the operator knows the
 * scope without us wiring half of it.
 */

interface Props {
  /** Whether the current user has settings.manage permission. */
  canEdit: boolean
}

export function CallFlowPanel({ canEdit }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rejectMode, setRejectMode] = useState<'soft' | 'hard'>('soft')

  useEffect(() => {
    let cancelled = false
    fetch('/api/settings/general')
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        const m = j?.data?.rejectMode === 'hard' ? 'hard' : 'soft'
        setRejectMode(m)
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSave(next: 'soft' | 'hard') {
    if (!canEdit) return
    setRejectMode(next) // optimistic
    setSaving(true)
    try {
      const res = await fetch('/api/settings/general', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectMode: next }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof json.error === 'string' ? json.error : 'Failed to save')
        return
      }
      toast.success(
        next === 'hard'
          ? 'Reject will now disconnect the caller immediately.'
          : 'Reject will only dismiss the CRM popup; caller keeps ringing.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      {/* ─── Reject Behavior ────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <PhoneOff className="w-4 h-4 text-gray-700" />
          <h3 className="text-sm font-semibold text-gray-800">Reject Behavior</h3>
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
          Controls what happens when an agent clicks <strong>Reject</strong> on the inbound call popup.
        </p>

        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <RejectModeCard
              active={rejectMode === 'soft'}
              disabled={!canEdit || saving}
              onSelect={() => handleSave('soft')}
              icon={<Phone className="w-4 h-4" />}
              title="Soft reject"
              tone="emerald"
              description="Only dismiss the CRM popup. The caller's phone keeps ringing for the full provider timeout (~30s) so they can still leave a voicemail or be picked up by a backup line."
              tag="Default"
            />
            <RejectModeCard
              active={rejectMode === 'hard'}
              disabled={!canEdit || saving}
              onSelect={() => handleSave('hard')}
              icon={<PhoneOff className="w-4 h-4" />}
              title="Hard reject"
              tone="rose"
              description="Tell Telnyx to hang up immediately so the caller's device disconnects right away — same behavior as a normal mobile-phone reject."
            />
          </div>
        )}
      </div>

      {/* ─── Placeholder for the larger Call Flow editor ────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <PhoneCall className="w-4 h-4 text-gray-700" />
          <h3 className="text-sm font-semibold text-gray-800">Call Flow</h3>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Define how incoming calls are routed — business hours, IVR menus, agent queues, and
          multi-agent ringing for the WebRTC softphone.
        </p>
        <div className="border border-dashed border-gray-200 rounded-lg p-6 text-center">
          <PhoneCall className="w-6 h-6 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Call flow configuration coming soon.</p>
          <p className="text-[11px] text-gray-400 mt-2 max-w-md mx-auto leading-relaxed">
            Includes per-agent SIP credentials so inbound calls can ring multiple browsers in
            parallel — first agent to answer takes the call. Requires changes to
            <code className="mx-1 px-1 bg-gray-100 rounded">/api/calls/credentials</code>
            to mint a credential per agent (today it&rsquo;s a single shared credential).
          </p>
        </div>
      </div>
    </div>
  )
}

function RejectModeCard({
  active,
  disabled,
  onSelect,
  icon,
  title,
  description,
  tone,
  tag,
}: {
  active: boolean
  disabled: boolean
  onSelect: () => void
  icon: React.ReactNode
  title: string
  description: string
  tone: 'emerald' | 'rose'
  tag?: string
}) {
  // Active card uses a tinted ring matching the tone so the operator
  // can see at a glance which mode is currently in force.
  const ringActive =
    tone === 'emerald'
      ? 'border-emerald-300 ring-2 ring-emerald-100 bg-emerald-50/30'
      : 'border-rose-300 ring-2 ring-rose-100 bg-rose-50/30'
  const iconActive = tone === 'emerald' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
  const iconInactive = 'bg-gray-100 text-gray-500'
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`text-left p-4 border rounded-xl transition-all ${
        active ? ringActive : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      } disabled:cursor-not-allowed disabled:opacity-70`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className={`w-7 h-7 rounded-lg flex items-center justify-center ${
            active ? iconActive : iconInactive
          }`}
        >
          {icon}
        </div>
        <span className="text-sm font-semibold text-gray-900">{title}</span>
        {tag && (
          <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
            {tag}
          </span>
        )}
        {active && (
          <span
            className={`ml-auto text-[10px] font-semibold uppercase tracking-wide ${
              tone === 'emerald' ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            Active
          </span>
        )}
      </div>
      <p className="text-xs text-gray-600 leading-relaxed">{description}</p>
    </button>
  )
}
