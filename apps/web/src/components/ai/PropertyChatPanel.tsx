'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageSquare, Send, Loader2, X } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  propertyId: string
}

export function PropertyChatPanel({ propertyId }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    setLoading(true)

    const history = messages
    const withUser: Message[] = [...history, { role: 'user', content: text }]
    setMessages(withUser)

    try {
      const res = await fetch(`/api/properties/${propertyId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      })
      const data = await res.json()
      const reply: string = res.ok ? data.reply : 'Sorry, something went wrong. Please try again.'
      setMessages([...withUser, { role: 'assistant', content: reply }])
    } catch {
      setMessages([
        ...withUser,
        { role: 'assistant', content: 'Network error. Please try again.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-purple-400" />
          Ask AI about this lead
        </span>
        <span className="text-[11px] text-gray-400">Click to open ›</span>
      </button>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-purple-500" />
          <span className="text-[13px] font-semibold text-gray-800">AI Chat</span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div className="h-64 overflow-y-auto p-3 space-y-2 bg-gray-50">
        {messages.length === 0 && (
          <p className="text-[12px] text-gray-400 text-center mt-10">
            Ask me anything about this lead.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-[12px] leading-relaxed ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-white border border-gray-200 text-gray-700 rounded-bl-sm'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-xl rounded-bl-sm px-3 py-2 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
              <span className="text-[12px] text-gray-400">Thinking…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 px-3 py-2 border-t border-gray-100 bg-white"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this lead…"
          disabled={loading}
          className="flex-1 text-[12px] border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-blue-600 text-white rounded-lg p-1.5 hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  )
}
