'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow, format } from 'date-fns'
import { Phone, Mail, MessageSquare, FileText, Volume2, Pencil, Trash2, Check, X } from 'lucide-react'
import { toast } from 'sonner'

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
  createdAt: Date
  sentBy: { name: string } | null
}

interface Props {
  messages: Message[]
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
    const dateKey = format(new Date(msg.createdAt), 'MMMM d, yyyy')
    const last = acc[acc.length - 1]
    if (last?.date === dateKey) {
      last.msgs.push(msg)
    } else {
      acc.push({ date: dateKey, msgs: [msg] })
    }
    return acc
  }, [])

  return (
    <div className="space-y-4 px-4 py-3">
      {grouped.map((group) => (
        <div key={group.date}>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-[11px] text-gray-400 font-medium">{group.date}</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>
          <div className="space-y-2">
            {group.msgs.map((msg) => {
              const isOutbound = msg.direction === 'OUTBOUND'
              const isNote = msg.channel === 'NOTE'
              return (
                <div key={msg.id} className={`group flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] ${isOutbound ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                    <div className={`flex items-center gap-1.5 ${isOutbound ? 'flex-row-reverse' : 'flex-row'}`}>
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${CHANNEL_COLORS[msg.channel] ?? 'bg-gray-100 text-gray-600'}`}>
                        {CHANNEL_ICONS[msg.channel]}
                        {msg.channel}
                      </span>
                      <span className="text-[10px] text-gray-400">{msg.sentBy?.name ?? 'System'}</span>
                    </div>
                    {msg.subject && (
                      <p className="text-[11px] font-semibold text-gray-700">{msg.subject}</p>
                    )}
                    <div className={`px-3 py-2 rounded-xl text-sm ${
                      isOutbound
                        ? 'bg-blue-600 text-white rounded-tr-sm'
                        : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
                    }`}>
                      {msg.body ? (
                        isNote
                          ? <div dangerouslySetInnerHTML={{ __html: msg.body }} />
                          : msg.body
                      ) : (
                        <em className="opacity-60">No content</em>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-gray-400">
                        {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                      </span>
                      {/* Edit/Delete for notes */}
                      {isNote && <NoteActions msg={msg} onDeleted={handleDeleted} />}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
