'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MessageThread } from '@/components/inbox/MessageThread'
import { NotesCard } from './NotesCard'
import { format } from 'date-fns'
import { Maximize2, Minimize2, FileText } from 'lucide-react'

/* ─── Tab + filter definitions ─── */

const MAIN_TABS = [
  { key: 'comms', label: 'Comm & Notes' },
  { key: 'activity', label: 'Activity' },
] as const

type MainTab = (typeof MAIN_TABS)[number]['key']

const COMM_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'SMS', label: 'SMS' },
  { key: 'CALL', label: 'Calls' },
  { key: 'NOTE', label: 'Notes' },
  { key: 'EMAIL', label: 'Email' },
] as const

type CommFilter = (typeof COMM_FILTERS)[number]['key']

/* ─── Activity labels ─── */

const ACTION_LABELS: Record<string, string> = {
  LEAD_CREATED: 'Lead Created',
  STAGE_CHANGED: 'Stage Changed',
  STAGE_CHANGE: 'Stage Changed',
  STATUS_CHANGED: 'Status Changed',
  STATUS_CHANGE: 'Status Changed',
  PIPELINE_CHANGE: 'Pipeline Changed',
  NOTE_ADDED: 'Note Added',
  TASK_CREATED: 'Task Created',
  TASK_COMPLETED: 'Task Completed',
  AI_SUMMARY_GENERATED: 'AI Summary',
  HOT_LEAD_SCORED: 'Hot Lead Scored',
  CONTACT_ADDED: 'Contact Added',
  CONTACT_REMOVED: 'Contact Removed',
  PROPERTY_PROMOTED: 'Promoted',
  OFFER_RECEIVED: 'Offer Received',
  TAG_ADDED: 'Tag Added',
  TAG_REMOVED: 'Tag Removed',
  MESSAGE_LOGGED: 'Message Logged',
  LEAD_DELETED: 'Lead Deleted',
}

/* ─── Types ─── */

interface ActivityLog {
  id: string
  action: string
  detail: any
  createdAt: Date | string
  user?: { id: string; name: string } | null
}

interface StageRecord {
  id: string
  pipeline: string
  fromStage?: string | null
  toStage: string
  changedByName?: string | null
  reason?: string | null
  createdAt: Date | string
}

interface Note {
  id: string
  body: string
  authorName?: string | null
  createdAt: Date | string
}

interface Props {
  propertyId: string
  messages: any[]
  notes: Note[]
  activityLogs: ActivityLog[]
  stageHistory: StageRecord[]
  expanded: boolean
  onToggleExpand: () => void
}


export function LeadDetailRightPanel({
  propertyId, messages, notes, activityLogs, stageHistory,
  expanded, onToggleExpand,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [mainTab, setMainTab] = useState<MainTab>('comms')
  const [commFilter, setCommFilter] = useState<CommFilter>('all')
  const [composeBody, setComposeBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const composeRef = useRef<HTMLTextAreaElement>(null)

  // Listen for compose events from QuickActionBar
  useEffect(() => {
    function handleCompose(e: Event) {
      const detail = (e as CustomEvent).detail
      if (detail) {
        setMainTab('comms')
        setTimeout(() => composeRef.current?.focus(), 100)
      }
    }
    window.addEventListener('lead-compose', handleCompose)
    return () => window.removeEventListener('lead-compose', handleCompose)
  }, [])

  // Filter messages by channel
  const filteredMessages = commFilter === 'all'
    ? messages
    : messages.filter((m: any) => m.channel === commFilter)

  // Merge activity logs and stage history
  const timelineItems = [
    ...activityLogs.map((a) => ({
      type: 'activity' as const,
      id: a.id,
      label: ACTION_LABELS[a.action] ?? a.action,
      detail: typeof a.detail === 'object' ? a.detail?.description : a.detail,
      user: a.user?.name,
      createdAt: new Date(a.createdAt),
    })),
    ...stageHistory.map((s) => ({
      type: 'stage' as const,
      id: s.id,
      label: `${s.fromStage ?? '—'} → ${s.toStage}`,
      detail: s.reason,
      user: s.changedByName,
      createdAt: new Date(s.createdAt),
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  async function handleSend() {
    const text = composeBody.replace(/<[^>]*>/g, '').trim()
    if (!text) return
    setSending(true)
    setError(null)
    try {
      // Always saves as a NOTE from this compose area
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          channel: 'NOTE',
          direction: 'OUTBOUND',
          body: composeBody, // Sends HTML-formatted note
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Failed to save note')
      }
      setComposeBody('')
      // Clear the contentEditable div
      if (composeRef.current) (composeRef.current as any).innerHTML = ''
      startTransition(() => router.refresh())
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Header: tabs + filter + expand ── */}
      <div className="flex items-center justify-between border-b-2 border-gray-200 bg-white px-3 flex-shrink-0">
        <div className="flex items-center">
          {MAIN_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setMainTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-[2px] transition-colors ${
                mainTab === tab.key
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleExpand}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            title={expanded ? 'Collapse panel' : 'Expand panel'}
          >
            {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* ── Filter bar (for comms tab) ── */}
      {mainTab === 'comms' && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100 bg-white flex-shrink-0">
          {COMM_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setCommFilter(f.key)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                commFilter === f.key
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        {mainTab === 'comms' && (
          <div className="h-full">
            {filteredMessages.length === 0 ? (
              <div className="flex items-center justify-center h-32">
                <p className="text-sm text-gray-400">No communications yet</p>
              </div>
            ) : (
              <MessageThread messages={filteredMessages as any} />
            )}
          </div>
        )}

        {mainTab === 'activity' && (
          <div className="p-4">
            {timelineItems.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No activity yet</p>
            ) : (
              <div className="relative pl-6">
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-200" />
                <div className="space-y-3">
                  {timelineItems.map((item) => (
                    <div key={item.id} className="relative flex gap-3">
                      <div className={`absolute -left-6 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                        item.type === 'stage' ? 'bg-blue-400' : 'bg-gray-300'
                      }`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-800">{item.label}</p>
                        {item.detail && (
                          <p className="text-[11px] text-gray-500 mt-0.5 truncate">{item.detail}</p>
                        )}
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {item.user && <span>{item.user} · </span>}
                          {format(item.createdAt, 'MMM d, h:mm a')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Note compose area (pinned at bottom, always visible) ── */}
      <div className="border-t border-gray-200 bg-white flex-shrink-0">
          {/* Formatting toolbar */}
          <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-gray-100">
            <button onClick={() => document.execCommand('bold')} className="w-7 h-7 flex items-center justify-center rounded text-sm font-bold text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors" title="Bold (Ctrl+B)">B</button>
            <button onClick={() => document.execCommand('italic')} className="w-7 h-7 flex items-center justify-center rounded text-sm italic text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors" title="Italic (Ctrl+I)">I</button>
            <button onClick={() => document.execCommand('underline')} className="w-7 h-7 flex items-center justify-center rounded text-sm underline text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors" title="Underline (Ctrl+U)">U</button>
            <button onClick={() => document.execCommand('strikeThrough')} className="w-7 h-7 flex items-center justify-center rounded text-sm line-through text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors" title="Strikethrough">S</button>
            <div className="w-px h-4 bg-gray-200 mx-1" />
            <button onClick={() => document.execCommand('insertOrderedList')} className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors" title="Numbered list">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
            </button>
            <button onClick={() => document.execCommand('insertUnorderedList')} className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors" title="Bullet list">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M4 6h0M4 12h0M4 18h0" /></svg>
            </button>
          </div>

          {/* Rich text note input (contentEditable) */}
          <div className="px-3 py-2">
            <div
              ref={composeRef as any}
              contentEditable
              data-placeholder="type @ to assign"
              onInput={(e) => setComposeBody((e.target as HTMLDivElement).innerHTML)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend() }}
              className="w-full min-h-[48px] max-h-[120px] overflow-y-auto text-sm focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
            />
          </div>

          {/* Bottom bar: Save Note + Aa */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100">
            <button
              onClick={handleSend}
              disabled={sending || !composeBody.trim() || composeBody === '<br>'}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-800 text-white text-xs font-medium rounded-lg transition-all disabled:opacity-40 active:scale-95"
            >
              {sending ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <FileText className="w-3 h-3" />
              )}
              Save Note
            </button>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-gray-400 cursor-pointer hover:text-gray-600 transition-colors" title="Font size" onClick={() => document.execCommand('fontSize', false, '5')}>Aa</span>
              <span className="text-[10px] text-gray-400">Ctrl+Enter</span>
            </div>
          </div>
          {error && <p className="text-xs text-red-600 px-3 pb-2">{error}</p>}
        </div>
    </div>
  )
}
