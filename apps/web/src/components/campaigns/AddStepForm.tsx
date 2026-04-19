'use client'

import { useState, useEffect } from 'react'
import {
  X,
  MessageSquare,
  Mail,
  Phone,
  Voicemail,
  StickyNote,
  Loader2,
  Info,
} from 'lucide-react'
import type { CampaignStep } from './CampaignStepCard'

type Channel = 'SMS' | 'EMAIL' | 'CALL' | 'RVM' | 'NOTE'

const CHANNELS: { value: Channel; label: string; icon: typeof MessageSquare; description: string }[] = [
  { value: 'SMS',   label: 'SMS',         icon: MessageSquare, description: 'Text message' },
  { value: 'EMAIL', label: 'Email',       icon: Mail,          description: 'Email message' },
  { value: 'CALL',  label: 'Call',        icon: Phone,         description: 'Phone call task' },
  { value: 'RVM',   label: 'Ringless VM', icon: Voicemail,     description: 'Voicemail drop' },
  { value: 'NOTE',  label: 'Note',        icon: StickyNote,    description: 'Internal note' },
]

const PLACEHOLDER_TOKENS = [
  { token: '{firstName}', label: 'First Name' },
  { token: '{lastName}', label: 'Last Name' },
  { token: '{propertyAddress}', label: 'Property Address' },
  { token: '{city}', label: 'City' },
  { token: '{state}', label: 'State' },
  { token: '{zip}', label: 'ZIP' },
  { token: '{marketName}', label: 'Market' },
  { token: '{agentName}', label: 'Agent Name' },
]

interface Props {
  campaignId: string
  editingStep: CampaignStep | null
  onSaved: () => void
  onCancel: () => void
}

export function AddStepForm({ campaignId, editingStep, onSaved, onCancel }: Props) {
  const isEditing = !!editingStep

  const [channel, setChannel] = useState<Channel>('SMS')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [delayDays, setDelayDays] = useState(0)
  const [delayHours, setDelayHours] = useState(0)
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (editingStep) {
      setChannel(editingStep.channel as Channel)
      setSubject(editingStep.subject ?? '')
      setBody(editingStep.body)
      setDelayDays(editingStep.delayDays)
      setDelayHours(editingStep.delayHours)
      setIsActive(editingStep.isActive)
    } else {
      setChannel('SMS')
      setSubject('')
      setBody('')
      setDelayDays(0)
      setDelayHours(0)
      setIsActive(true)
    }
  }, [editingStep])

  function insertToken(token: string) {
    setBody((prev) => prev + token)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setError(null)
    setSaving(true)

    try {
      const payload = {
        channel,
        subject: channel === 'EMAIL' ? subject.trim() || null : null,
        body: body.trim(),
        delayDays,
        delayHours,
        ...(isEditing ? { isActive } : {}),
      }

      const url = isEditing
        ? `/api/campaigns/${campaignId}/steps/${editingStep!.id}`
        : `/api/campaigns/${campaignId}/steps`

      const res = await fetch(url, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error?.toString() ?? 'Failed to save step')
      }

      onSaved()
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-gray-100">
        <h4 className="text-[13px] font-semibold text-gray-900">
          {isEditing ? 'Edit Step' : 'Add New Step'}
        </h4>
        <button
          onClick={onCancel}
          className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {/* Channel selector */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Channel
          </label>
          <div className="grid grid-cols-5 gap-2">
            {CHANNELS.map((ch) => {
              const ChIcon = ch.icon
              const selected = channel === ch.value
              return (
                <button
                  key={ch.value}
                  type="button"
                  onClick={() => setChannel(ch.value)}
                  className={`flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-lg border-2 transition-all text-center ${
                    selected
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-100 bg-white text-gray-500 hover:border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <ChIcon className="w-4 h-4" />
                  <span className="text-[11px] font-medium">{ch.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Delay configuration */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Delay After Previous Step
          </label>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                value={delayDays}
                onChange={(e) => setDelayDays(Math.max(0, Number(e.target.value)))}
                className="w-16 border border-gray-200 rounded-lg px-2.5 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="text-sm text-gray-500">days</span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={23}
                value={delayHours}
                onChange={(e) => setDelayHours(Math.min(23, Math.max(0, Number(e.target.value))))}
                className="w-16 border border-gray-200 rounded-lg px-2.5 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="text-sm text-gray-500">hours</span>
            </div>
            {delayDays === 0 && delayHours === 0 && (
              <span className="text-xs text-gray-400 italic">Sends immediately</span>
            )}
          </div>
        </div>

        {/* Subject (email only) */}
        {channel === 'EMAIL' && (
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Subject Line
            </label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter email subject..."
            />
          </div>
        )}

        {/* Message body */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Message Body
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            rows={4}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none leading-relaxed"
            placeholder={
              channel === 'EMAIL'
                ? 'Write your email body...'
                : channel === 'CALL'
                  ? 'Call script or talking points...'
                  : channel === 'NOTE'
                    ? 'Internal note...'
                    : 'Write your message...'
            }
          />
          {/* Token insert buttons */}
          <div className="mt-2">
            <p className="text-[10px] text-gray-400 mb-1.5 flex items-center gap-1">
              <Info className="w-3 h-3" />
              Insert merge fields:
            </p>
            <div className="flex flex-wrap gap-1">
              {PLACEHOLDER_TOKENS.map((t) => (
                <button
                  key={t.token}
                  type="button"
                  onClick={() => insertToken(t.token)}
                  className="text-[10px] font-mono bg-gray-50 text-gray-500 border border-gray-200 rounded px-1.5 py-0.5 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors"
                >
                  {t.token}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Active toggle (edit mode only) */}
        {isEditing && (
          <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
            <span className="text-sm text-gray-600">Step is active</span>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                isActive ? 'bg-emerald-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  isActive ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={saving || !body.trim()}
            className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-[13px] font-semibold rounded-lg px-4 py-2 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving
              ? isEditing ? 'Saving...' : 'Adding...'
              : isEditing ? 'Save Changes' : 'Add Step'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-[13px] font-medium text-gray-500 hover:text-gray-700 px-3 py-2 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
