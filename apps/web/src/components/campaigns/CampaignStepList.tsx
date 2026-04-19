'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ChevronUp } from 'lucide-react'

interface CampaignStep {
  id: string
  order: number
  channel: string
  subject: string | null
  body: string
  delayDays: number
  delayHours: number
  isActive: boolean
}

interface Props {
  campaignId: string
  steps: CampaignStep[]
}

const CHANNELS = ['SMS', 'EMAIL', 'CALL', 'RVM', 'NOTE'] as const

const CHANNEL_COLOR: Record<string, string> = {
  SMS: 'bg-blue-50 text-blue-700',
  EMAIL: 'bg-purple-50 text-purple-700',
  CALL: 'bg-emerald-50 text-emerald-700',
  RVM: 'bg-amber-50 text-amber-700',
  NOTE: 'bg-gray-100 text-gray-700',
}

export function CampaignStepList({ campaignId, steps }: Props) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [channel, setChannel] = useState<'SMS' | 'EMAIL' | 'CALL' | 'RVM' | 'NOTE'>('SMS')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [delayDays, setDelayDays] = useState(0)
  const [delayHours, setDelayHours] = useState(0)
  const [saving, setSaving] = useState(false)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setSaving(true)
    try {
      await fetch(`/api/campaigns/${campaignId}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, subject: subject.trim() || undefined, body: body.trim(), delayDays, delayHours }),
      })
      setBody(''); setSubject(''); setDelayDays(0); setDelayHours(0)
      setShowForm(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(stepId: string) {
    if (!confirm('Delete this step?')) return
    await fetch(`/api/campaigns/${campaignId}/steps`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stepId }),
    })
    router.refresh()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="text-[13px] font-semibold text-gray-900">
          Steps ({steps.length})
        </h3>
        <button onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1 text-[12px] font-medium text-blue-600 hover:text-blue-700">
          {showForm ? <ChevronUp className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showForm ? 'Cancel' : 'Add Step'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="p-4 border-b border-gray-100 bg-slate-50 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Channel *</label>
              <select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Send After</label>
              <div className="flex gap-1.5 items-center">
                <input type="number" min={0} value={delayDays} onChange={(e) => setDelayDays(Number(e.target.value))}
                  className="w-14 border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                <span className="text-xs text-gray-500">d</span>
                <input type="number" min={0} max={23} value={delayHours} onChange={(e) => setDelayHours(Number(e.target.value))}
                  className="w-14 border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                <span className="text-xs text-gray-500">h</span>
              </div>
            </div>
          </div>
          {channel === 'EMAIL' && (
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Subject</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Email subject line" />
            </div>
          )}
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Message Body *</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={3}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              placeholder="Message text..." />
          </div>
          <button type="submit" disabled={saving || !body.trim()}
            className="bg-blue-600 text-white text-xs font-semibold rounded-lg px-4 py-1.5 hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Adding…' : 'Add Step'}
          </button>
        </form>
      )}

      {steps.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-gray-400">
          No steps yet — add the first step above.
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {steps.map((step, idx) => (
            <div key={step.id} className="px-4 py-3 flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[11px] font-bold text-gray-500 flex-shrink-0 mt-0.5">
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${CHANNEL_COLOR[step.channel] ?? 'bg-gray-100 text-gray-600'}`}>
                    {step.channel}
                  </span>
                  {step.delayDays > 0 || step.delayHours > 0 ? (
                    <span className="text-[11px] text-gray-400">
                      after {step.delayDays > 0 ? `${step.delayDays}d ` : ''}{step.delayHours > 0 ? `${step.delayHours}h` : ''}
                    </span>
                  ) : (
                    <span className="text-[11px] text-gray-400">immediately</span>
                  )}
                </div>
                {step.subject && <p className="text-[12px] font-medium text-gray-700 truncate">{step.subject}</p>}
                <p className="text-[12px] text-gray-600 line-clamp-2">{step.body}</p>
              </div>
              <button onClick={() => handleDelete(step.id)}
                className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
