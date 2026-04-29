'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, Clock, Paperclip, ChevronDown, Check } from 'lucide-react'
import { toast } from 'sonner'

/* ── Types ── */

interface ContactOption {
  id: string
  name: string
  phone: string
  type?: string
}

interface TwilioNumber {
  id: string
  number: string
  friendlyName: string | null
}

interface SmsTemplate {
  id: string
  name: string
  body: string
}

interface Props {
  propertyId: string
  contacts: ContactOption[]
  defaultContactId?: string
  propertyAddress: string
  onClose: () => void
}

const US_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HT)' },
]

export function SendSmsModal({
  propertyId,
  contacts,
  defaultContactId,
  propertyAddress,
  onClose,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  // Contact selection
  const initialContactId = defaultContactId ?? contacts[0]?.id ?? ''
  const [selectedContactId, setSelectedContactId] = useState(initialContactId)
  const selectedContact = contacts.find((c) => c.id === selectedContactId) ?? contacts[0]

  // Twilio numbers
  const [twilioNumbers, setTwilioNumbers] = useState<TwilioNumber[]>([])
  const [selectedFromNumber, setSelectedFromNumber] = useState('')
  const [showFromPicker, setShowFromPicker] = useState(false)
  const [fromScope, setFromScope] = useState<'this_message' | 'default'>('this_message')

  // Templates
  const [templates, setTemplates] = useState<SmsTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')

  // Message
  const [message, setMessage] = useState('')

  // Scheduling
  const [wantSchedule, setWantSchedule] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [timezone, setTimezone] = useState('America/New_York')

  // UI state
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const charCount = message.length
  const segmentCount = Math.max(1, Math.ceil(charCount / 160))

  /* ── Fetch Twilio numbers + lead's saved default on mount ──
   *
   * Two-stage load (matches CallPanel):
   *   1) /api/twilio-numbers          → pre-select nums[0] immediately.
   *   2) /api/leads/[id]/sender       → upgrade to saved default.
   *
   * Both fire in parallel. The picker is never blank — and if a saved
   * default exists, the swap from nums[0] → saved default happens
   * within the same render tick most of the time. */
  useEffect(() => {
    let cancelled = false
    let appliedSavedDefault = false

    fetch('/api/twilio-numbers')
      .then((r) => r.json())
      .then((numsJson) => {
        if (cancelled) return
        const nums: TwilioNumber[] = numsJson?.data ?? []
        setTwilioNumbers(nums)
        if (!appliedSavedDefault && nums.length > 0) {
          setSelectedFromNumber((current) => current || nums[0].number)
        }
      })
      .catch(() => {})

    fetch(`/api/leads/${propertyId}/sender`)
      .then((r) => r.json())
      .then((senderJson) => {
        if (cancelled) return
        const leadDefault: string | null = senderJson?.defaultOutboundNumber ?? null
        const campaignNumber: string | null = senderJson?.campaignNumber ?? null
        const preferred = leadDefault || campaignNumber
        if (preferred) {
          appliedSavedDefault = true
          setSelectedFromNumber(preferred)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [propertyId])

  /* ── Fetch SMS templates on mount ── */
  useEffect(() => {
    fetch('/api/templates?type=sms')
      .then((r) => r.json())
      .then((json) => {
        setTemplates(json.data ?? [])
      })
      .catch(() => {})
  }, [])

  /* ── Template selection fills message ── */
  function handleTemplateChange(templateId: string) {
    setSelectedTemplateId(templateId)
    const tpl = templates.find((t) => t.id === templateId)
    if (tpl) setMessage(tpl.body)
  }

  /* ── Save default outbound number for lead ──
   *
   * Used in two paths:
   *   1) The user clicks the new "Confirm" button in the picker —
   *      saves immediately, shows a toast, collapses the picker.
   *   2) The user clicks "Send Right Away" while still on the
   *      "Set as default for this lead" radio — handleSend() awaits
   *      this before dispatching the SMS so the chosen number is
   *      both the sender AND the new default in one step.
   *
   * Idempotent — a no-op when fromScope !== 'default'. */
  const [savingDefault, setSavingDefault] = useState(false)
  async function handleSetDefaultNumber(opts?: { silent?: boolean }) {
    if (fromScope !== 'default' || !selectedFromNumber) return false
    setSavingDefault(true)
    try {
      const res = await fetch(`/api/leads/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultOutboundNumber: selectedFromNumber }),
      })
      if (!res.ok) throw new Error('Save failed')
      if (!opts?.silent) {
        toast.success(`${selectedFromNumber} saved as default for this lead`)
      }
      return true
    } catch (err) {
      if (!opts?.silent) {
        toast.error('Failed to save default number')
      }
      return false
    } finally {
      setSavingDefault(false)
    }
  }

  /* Standalone "Confirm" button handler — saves + collapses the
   * picker so the affordance feels like a real action, not a hidden
   * side-effect of sending. */
  async function handleConfirmDefault() {
    const ok = await handleSetDefaultNumber()
    if (ok) {
      setShowFromPicker(false)
      // Reset scope so the next reopen of the picker doesn't keep
      // re-saving on send. The number is now the saved default; the
      // user can change it again later if needed.
      setFromScope('this_message')
    }
  }

  /* ── Build scheduled timestamp ── */
  function buildScheduledAt(): string | undefined {
    if (!wantSchedule || !scheduleDate || !scheduleTime) return undefined
    return `${scheduleDate}T${scheduleTime}:00`
  }

  /* ── Send / Schedule ── */
  async function handleSend() {
    if (!message.trim()) return
    if (!selectedContact?.phone) return

    setSending(true)
    setError(null)

    try {
      // If user chose to set number as default, do that first.
      // Silent so the send-success toast isn't preceded by a second
      // "saved as default" toast — the user just clicked Send, the
      // default save is implicit.
      await handleSetDefaultNumber({ silent: true })

      const scheduledAt = buildScheduledAt()

      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          channel: 'SMS',
          direction: 'OUTBOUND',
          body: message,
          to: selectedContact.phone,
          from: selectedFromNumber || undefined,
          scheduledAt,
          timezone: scheduledAt ? timezone : undefined,
        }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Failed to send SMS')
      }

      startTransition(() => router.refresh())
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  const sendLabel = wantSchedule && scheduleDate && scheduleTime
    ? 'Schedule Message'
    : 'Send Right Away'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">

        {/* ── Header ── */}
        <div className="bg-blue-700 rounded-t-2xl px-6 py-4 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-semibold text-white">Send Message</h2>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Body (scrollable) ── */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">

          {/* 1. Send To */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Send To
            </label>
            <div className="relative">
              <select
                value={selectedContactId}
                onChange={(e) => setSelectedContactId(e.target.value)}
                className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2.5 pr-8 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              >
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.type ? `\u00B7 ${c.type}` : ''} ({c.phone})
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* 2. Sending From */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-700">
                Sending From
              </label>
              {twilioNumbers.length > 1 && (
                <button
                  type="button"
                  onClick={() => setShowFromPicker(!showFromPicker)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                >
                  Change
                </button>
              )}
            </div>
            <div className="border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 text-sm text-gray-700">
              {selectedFromNumber || 'Loading...'}
            </div>

            {showFromPicker && twilioNumbers.length > 1 && (
              <div className="mt-2 border border-gray-200 rounded-lg p-3 bg-white space-y-3">
                <div className="relative">
                  <select
                    value={selectedFromNumber}
                    onChange={(e) => setSelectedFromNumber(e.target.value)}
                    className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  >
                    {twilioNumbers.map((n) => (
                      <option key={n.id} value={n.number}>
                        {n.friendlyName ? `${n.friendlyName} (${n.number})` : n.number}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="fromScope"
                      checked={fromScope === 'this_message'}
                      onChange={() => setFromScope('this_message')}
                      className="w-3.5 h-3.5 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-600">Use for this message only</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="fromScope"
                      checked={fromScope === 'default'}
                      onChange={() => setFromScope('default')}
                      className="w-3.5 h-3.5 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-600">Set as default for this lead</span>
                  </label>
                </div>

                {/* Confirm — only visible while the user is on the
                    "Set as default" radio. Mirrors the Call Panel's
                    Confirm button so the user can save the default
                    independently of sending the message. */}
                {fromScope === 'default' && (
                  <button
                    type="button"
                    onClick={handleConfirmDefault}
                    disabled={savingDefault || !selectedFromNumber}
                    className="mt-1 w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium py-2 rounded-lg transition-colors active:scale-[0.99]"
                  >
                    {savingDefault ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    Confirm
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 3. Template Picker */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-700">
                Choose the message from templates ({templates.length})
              </label>
              <a
                href="/settings?tab=templates"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                Create New Template
              </a>
            </div>
            <div className="relative">
              <select
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2.5 pr-8 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              >
                <option value="">Select a template...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* 4. Message Text */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-700">
                Message Text <span className="text-red-500">*</span>
              </label>
              <span className="text-xs text-gray-400">
                ({charCount}/{segmentCount})
              </span>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              rows={4}
              autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            />
          </div>

          {/* 5. Schedule Toggle */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-semibold text-gray-700">
                Do you want to schedule this SMS for later date and time?
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setWantSchedule(true)}
                className={`px-4 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  wantSchedule
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setWantSchedule(false)}
                className={`px-4 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  !wantSchedule
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                No
              </button>
            </div>

            {wantSchedule && (
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Date</label>
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Time</label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Timezone</label>
                  <div className="relative">
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                    >
                      {US_TIMEZONES.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 6. Attachments (placeholder UI) */}
          <div>
            <button
              type="button"
              className="inline-flex items-center gap-2 text-xs font-medium text-gray-600 border border-dashed border-gray-300 rounded-lg px-4 py-2.5 hover:border-gray-400 hover:text-gray-800 transition-colors"
            >
              <Paperclip className="w-4 h-4" />
              Add attachments
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl flex-shrink-0">
          <button
            onClick={onClose}
            disabled={sending}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !message.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
          >
            {sending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {sendLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
