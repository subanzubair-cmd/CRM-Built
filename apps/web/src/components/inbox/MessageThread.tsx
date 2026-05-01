'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, Mail, MessageSquare, FileText, Volume2, Pencil, Trash2, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { useTz } from '@/components/providers/TimezoneProvider'
import { ActivityRow } from '@/components/activity/ActivityRow'

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  SMS:   <MessageSquare className="w-3.5 h-3.5" />,
  CALL:  <Phone className="w-3.5 h-3.5" />,
  EMAIL: <Mail className="w-3.5 h-3.5" />,
  NOTE:  <FileText className="w-3.5 h-3.5" />,
  RVM:   <Volume2 className="w-3.5 h-3.5" />,
}

const CHANNEL_COLORS: Record<string, string> = {
  SMS:    'bg-blue-50 text-blue-700',
  CALL:   'bg-green-50 text-green-700',
  EMAIL:  'bg-purple-50 text-purple-700',
  NOTE:   'bg-gray-100 text-gray-600',
  RVM:    'bg-yellow-50 text-yellow-700',
  SYSTEM: 'bg-gray-50 text-gray-500',
}

interface Message {
  id: string
  channel: string
  direction: string
  body: string | null
  subject: string | null
  from?: string | null
  to?: string | null
  /** ActiveCall.id reference for CALL messages — drives the inline
   *  recording player when present. */
  twilioSid?: string | null
  /** Read-time enrichment from ActiveCall for CALL messages
   *  (set by getConversationMessages — see lib/inbox.ts). */
  callCost?: number | null
  callCostCurrency?: string | null
  callHasRecording?: boolean
  callDurationSec?: number | null
  callStatus?: string | null
  /** SMS delivery status: SENT | DELIVERED | FAILED | UNDELIVERED */
  status?: string | null
  /** Provider error detail when status is FAILED/UNDELIVERED. */
  failReason?: string | null
  createdAt: Date
  sentBy: { name: string } | null
}

function formatPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/[^\d]/g, '')
  if (raw.startsWith('+1') && digits.length === 11) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return raw
}

interface Props {
  messages: Message[]
}

/**
 * Inline note row — keeps the rich-text + edit/delete affordances
 * that don't belong on the icon-box ActivityRow used for CALL/SMS/
 * EMAIL. Indented to differentiate visually from comms rows.
 */
function NoteRow({
  msg,
  onDeleted,
  timestamp,
}: {
  msg: Message
  onDeleted: (id: string) => void
  timestamp: string
}) {
  return (
    <div className="px-5 py-3 flex items-start gap-3 group">
      <div className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0 mt-0.5">
        <FileText className="w-4 h-4 text-gray-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-semibold text-gray-700">
            Note · {msg.sentBy?.name ?? 'System'}
          </span>
          <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">{timestamp}</span>
        </div>
        <div className="mt-1 text-sm text-gray-800 leading-snug">
          {msg.body ? (
            <div dangerouslySetInnerHTML={{ __html: msg.body }} />
          ) : (
            <em className="opacity-60">No content</em>
          )}
        </div>
        <div className="mt-1">
          <NoteActions msg={msg} onDeleted={onDeleted} />
        </div>
      </div>
    </div>
  )
}

function NoteActions({ msg, onDeleted }: { msg: Message; onDeleted: (id: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState(msg.body ?? '')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!editBody.trim()) return
    setBusy(true)
    try {
      await fetch(`/api/messages/${msg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: editBody.trim() }),
      })
      toast.success('Note updated')
      setEditing(false)
      ;(window as any).showPageLoading?.()
      window.location.reload()
    } catch { toast.error('Failed to update') }
    finally { setBusy(false) }
  }

  async function remove() {
    if (!confirm('Delete this note?')) return
    setBusy(true)
    try {
      await fetch(`/api/messages/${msg.id}`, { method: 'DELETE' })
      toast.success('Note deleted')
      onDeleted(msg.id)
    } catch { toast.error('Failed to delete') }
    finally { setBusy(false) }
  }

  if (editing) {
    return (
      <div className="mt-1 space-y-1">
        <textarea
          value={editBody}
          onChange={(e) => setEditBody(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          rows={2}
          autoFocus
        />
        <div className="flex gap-1">
          <button onClick={save} disabled={busy} className="flex items-center gap-0.5 text-[10px] text-blue-600 hover:text-blue-800 font-medium"><Check className="w-3 h-3" /> Save</button>
          <button onClick={() => { setEditing(false); setEditBody(msg.body ?? '') }} className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-gray-600"><X className="w-3 h-3" /> Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-0.5 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      <button onClick={() => setEditing(true)} className="p-0.5 text-gray-400 hover:text-blue-600" title="Edit"><Pencil className="w-3 h-3" /></button>
      <button onClick={remove} disabled={busy} className="p-0.5 text-gray-400 hover:text-red-600" title="Delete"><Trash2 className="w-3 h-3" /></button>
    </div>
  )
}

export function MessageThread({ messages: initialMessages }: Props) {
  const [messages, setMessages] = useState(initialMessages)
  const tz = useTz()

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400">
        No communications yet
      </div>
    )
  }

  function handleDeleted(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }

  const grouped = messages.reduce<Array<{ date: string; msgs: Message[] }>>((acc, msg) => {
    const dateKey = tz.format(new Date(msg.createdAt), 'MMMM d, yyyy')
    const last = acc[acc.length - 1]
    if (last?.date === dateKey) {
      last.msgs.push(msg)
    } else {
      acc.push({ date: dateKey, msgs: [msg] })
    }
    return acc
  }, [])

  return (
    <div className="space-y-3 py-2">
      {grouped.map((group) => (
        <div key={group.date}>
          <div className="flex items-center gap-2 mb-1 px-2">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-[11px] text-gray-400 font-medium">{group.date}</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>
          {/* No nested rounded rectangle — the outer Comm & Notes tab
              already provides the card boundary. Removing the inner
              border lets each row use the full width available so the
              recording player + From/To meta don't have to compete
              with stacked horizontal padding. */}
          <div className="divide-y divide-gray-50">
            {group.msgs.map((msg) => {
              const isNote = msg.channel === 'NOTE'
              if (isNote) {
                // Notes keep the chat-bubble UI because they're
                // rich-text + need the inline edit/delete actions.
                return (
                  <NoteRow
                    key={msg.id}
                    msg={msg}
                    onDeleted={handleDeleted}
                    timestamp={tz.formatRelative(new Date(msg.createdAt))}
                  />
                )
              }
              const isOutbound = msg.direction === 'OUTBOUND'
              // Outcome parser for CALL messages so the colored
              // "LEAD CONNECTED" line renders separately from notes.
              let outcomeLabel: string | null = null
              let outcomeKind: 'connected' | 'not-connected' | null = null
              if (msg.channel === 'CALL' && msg.body) {
                const m = msg.body.match(/^(LEAD (?:NOT-)?CONNECTED \([^)]+\))/i)
                if (m) {
                  outcomeLabel = m[1]
                  outcomeKind = outcomeLabel.toUpperCase().includes('NOT-') ? 'not-connected' : 'connected'
                }
              }
              const cost = typeof msg.callCost === 'number'
                ? (msg.callCost < 0.01 ? `$${msg.callCost.toFixed(4)}` : `$${msg.callCost.toFixed(2)}`)
                : null
              return (
                <ActivityRow
                  key={msg.id}
                  channel={msg.channel}
                  direction={msg.direction}
                  primary={isOutbound ? msg.to ?? null : msg.from ?? null}
                  // From / To always rendered for SMS / CALL / EMAIL.
                  fromAddress={msg.from ?? null}
                  toAddress={msg.to ?? null}
                  byName={isOutbound ? (msg.sentBy?.name ?? null) : null}
                  body={msg.channel === 'CALL' ? null : msg.body}
                  outcomeLabel={outcomeLabel}
                  outcomeKind={outcomeKind}
                  costFormatted={cost}
                  callIdForRecording={msg.twilioSid ?? null}
                  hasRecording={msg.channel === 'CALL' && !!msg.callHasRecording}
                  timestamp={tz.formatRelative(new Date(msg.createdAt))}
                  messageStatus={msg.status ?? null}
                  deliveryFailReason={msg.failReason ?? null}
                />
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
