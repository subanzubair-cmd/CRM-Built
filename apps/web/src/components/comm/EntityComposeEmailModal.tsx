'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, Clock, Paperclip, Mail } from 'lucide-react'
import { toast } from 'sonner'

interface ContactOption {
  id: string
  name: string
  phone?: string
  email?: string | null
  type?: string
}

interface EmailTemplate {
  id: string
  name: string
  subject?: string
  body?: string
}

interface Props {
  entityType: 'buyer' | 'vendor'
  entityId: string
  contacts: ContactOption[]
  label: string
  onClose: () => void
}

const TIMEZONE_OPTIONS = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
]

const SYSTEM_EMAIL = process.env.NEXT_PUBLIC_SYSTEM_EMAIL ?? 'noreply@homewardpartners.com'

export function EntityComposeEmailModal({ entityType, entityId, contacts, label, onClose }: Props) {
  // Filter contacts that have an email address
  const emailContacts = contacts.filter((c) => c.email)

  const defaultContact = emailContacts[0] ?? null

  const [selectedContactId, setSelectedContactId] = useState(defaultContact?.id ?? '')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Schedule state
  const [wantSchedule, setWantSchedule] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [timezone, setTimezone] = useState('America/New_York')

  // Templates
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')

  const selectedContact = emailContacts.find((c) => c.id === selectedContactId) ?? null

  // Fetch email templates
  useEffect(() => {
    let cancelled = false
    setLoadingTemplates(true)
    fetch('/api/templates?type=email')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) {
          const arr: EmailTemplate[] = data?.data ?? (Array.isArray(data) ? data : [])
          setTemplates(arr)
        }
      })
      .catch(() => {
        if (!cancelled) setTemplates([])
      })
      .finally(() => {
        if (!cancelled) setLoadingTemplates(false)
      })
    return () => { cancelled = true }
  }, [])

  function handleTemplateChange(templateId: string) {
    setSelectedTemplateId(templateId)
    if (!templateId) return
    const tpl = templates.find((t) => t.id === templateId)
    if (tpl) {
      if (tpl.subject) setSubject(tpl.subject)
      if (tpl.body) setBody(tpl.body)
    }
  }

  function buildScheduledAt(): string | undefined {
    if (!wantSchedule || !scheduleDate || !scheduleTime) return undefined
    return `${scheduleDate}T${scheduleTime}:00`
  }

  async function handleSend() {
    if (!selectedContact?.email || !subject.trim() || !body.trim()) return
    setSending(true)
    setError(null)
    try {
      const scheduledAt = buildScheduledAt()
      const res = await fetch(`/api/${entityType}s/${entityId}/log-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: selectedContact.email,
          subject: subject.trim(),
          body,
          scheduledAt: scheduledAt || undefined,
          timezone: scheduledAt ? timezone : undefined,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Failed to send email')
      }
      toast.success('Email sent')
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  const canSend = !!selectedContact?.email && subject.trim().length > 0 && body.trim().length > 0
  const actionLabel = wantSchedule && scheduleDate && scheduleTime ? 'Schedule Email' : 'Send Right Away'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-blue-700 rounded-t-2xl px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-white/80" />
            <h2 className="text-lg font-semibold text-white">Compose Email</h2>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
          {/* No contacts warning */}
          {emailContacts.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">
              No email address found for {label}. Please add an email address before sending.
            </div>
          )}

          {/* Send To / Sending From */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Send To</label>
              {emailContacts.length > 1 ? (
                <select
                  value={selectedContactId}
                  onChange={(e) => setSelectedContactId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                >
                  {emailContacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} &middot; {c.type ?? 'Contact'} ({c.email})
                    </option>
                  ))}
                </select>
              ) : emailContacts.length === 1 ? (
                <div className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-sm text-gray-700">
                  {emailContacts[0].name} &middot; {emailContacts[0].type ?? 'Contact'} ({emailContacts[0].email})
                </div>
              ) : (
                <div className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-sm text-gray-400 italic">
                  No email contacts
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Sending From</label>
              <div className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-100 text-sm text-gray-500 truncate">
                {SYSTEM_EMAIL}
              </div>
            </div>
          </div>

          {/* Template Picker */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Choose from email templates{' '}
              {!loadingTemplates && <span className="text-gray-400">({templates.length})</span>}
            </label>
            <div className="flex items-center gap-2">
              <select
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                disabled={loadingTemplates || templates.length === 0}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="">
                  {loadingTemplates
                    ? 'Loading templates...'
                    : templates.length === 0
                      ? 'No templates available'
                      : 'Select a template...'}
                </option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <a
                href="/settings/templates"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-700 whitespace-nowrap hover:underline"
              >
                Create New Template
              </a>
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Subject <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject line..."
              autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Message Body <span className="text-red-500">*</span>
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your email message..."
              rows={8}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            />
          </div>

          {/* Schedule Toggle */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/50">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">
                Do you want to schedule this email for later?
              </span>
            </div>
            <div className="flex items-center gap-4 mb-3">
              <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
                <input
                  type="radio"
                  name="schedule"
                  checked={!wantSchedule}
                  onChange={() => setWantSchedule(false)}
                  className="accent-blue-600"
                />
                No
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
                <input
                  type="radio"
                  name="schedule"
                  checked={wantSchedule}
                  onChange={() => setWantSchedule(true)}
                  className="accent-blue-600"
                />
                Yes
              </label>
            </div>
            {wantSchedule && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Date</label>
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Time</label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Timezone</label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {TIMEZONE_OPTIONS.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz.replace('America/', '').replace('Pacific/', '').replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Attachments placeholder */}
          <div>
            <button
              type="button"
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
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

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl shrink-0">
          <button
            onClick={onClose}
            disabled={sending}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !canSend}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
          >
            {sending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
