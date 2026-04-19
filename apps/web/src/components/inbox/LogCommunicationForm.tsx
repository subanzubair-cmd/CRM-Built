'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, MessageSquare, FileText, Mail } from 'lucide-react'

const CHANNELS = [
  { value: 'CALL',  label: 'Call',  icon: <Phone className="w-3.5 h-3.5" /> },
  { value: 'SMS',   label: 'SMS',   icon: <MessageSquare className="w-3.5 h-3.5" /> },
  { value: 'NOTE',  label: 'Note',  icon: <FileText className="w-3.5 h-3.5" /> },
  { value: 'EMAIL', label: 'Email', icon: <Mail className="w-3.5 h-3.5" /> },
]

interface Props {
  propertyId: string
  onSent?: () => void
}

export function LogCommunicationForm({ propertyId, onSent }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [channel, setChannel] = useState('CALL')
  const [direction, setDirection] = useState('OUTBOUND')
  const [body, setBody] = useState('')
  const [subject, setSubject] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!body.trim()) return
    setError(null)

    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId, channel, direction, body, subject: subject || undefined }),
    })

    if (!res.ok) {
      const json = await res.json()
      setError(json.error ?? 'Failed to log communication')
      return
    }

    setBody('')
    setSubject('')
    onSent?.()
    startTransition(() => router.refresh())
  }

  return (
    <div className="border-t border-gray-100 pt-4">
      <div className="flex items-center gap-2 mb-2">
        {CHANNELS.map((c) => (
          <button
            key={c.value}
            onClick={() => setChannel(c.value)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              channel === c.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {c.icon}
            {c.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          {(['OUTBOUND', 'INBOUND'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDirection(d)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                direction === d ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {d === 'OUTBOUND' ? 'Outbound' : 'Inbound'}
            </button>
          ))}
        </div>
      </div>

      {channel === 'EMAIL' && (
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}

      <div className="flex gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            channel === 'CALL' ? 'Call notes...' :
            channel === 'SMS' ? 'SMS message...' :
            channel === 'EMAIL' ? 'Email body...' :
            'Note...'
          }
          rows={2}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={submit}
          disabled={isPending || !body.trim()}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 self-end"
        >
          {isPending ? '...' : 'Log'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
