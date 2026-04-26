'use client'

import { PhoneOutgoing, PhoneIncoming, PhoneMissed, MessageSquare, Mail, FileText, ExternalLink, Sparkles, Webhook } from 'lucide-react'
import Link from 'next/link'
import { CallRecordingPlayer } from '@/components/calls/CallRecordingPlayer'

/**
 * ActivityRow — unified icon-box row used by `/activity` and the lead
 * detail Comm & Notes timeline. Replaces the chat-bubble layout for
 * call/SMS/email entries with a wide list-style row matching the
 * REsimpli-style activity feed:
 *
 *   ┌────┬───────────────────────────────────────┬──────────────┐
 *   │icon│ phone • name           |  outcome     │   timestamp  │
 *   │ box│ By: agent • agent#                                   │
 *   │    │ [recording player]                                   │
 *   │    │ [Summ.] [L:-] [A:-] [webhook]                        │
 *   └────┴───────────────────────────────────────┴──────────────┘
 *
 * Designed to be data-driven so the same component renders inbound
 * calls, outbound calls, SMS, emails, and notes with channel-specific
 * icons + content blocks.
 */

export interface ActivityRowProps {
  /** call | sms | email | note */
  channel: string
  direction?: 'INBOUND' | 'OUTBOUND' | string | null
  /** Counterparty primary identifier (phone or email). */
  primary: string | null
  /** Counterparty name (resolved contact). */
  name?: string | null
  /** Sender display ("By: <name>") for outbound messages. */
  byName?: string | null
  /** Sender phone/email for outbound. */
  bySecondary?: string | null
  /** Recipient identifier ("To: <number>") for outbound SMS/email. */
  toSecondary?: string | null
  /** Body text — main message content for SMS/email/note. */
  body?: string | null
  /** Optional outcome line shown below the header (e.g., LEAD CONNECTED (Other)). */
  outcomeLabel?: string | null
  outcomeKind?: 'connected' | 'not-connected' | null
  /** Cost line — already formatted ("$0.0042"). */
  costFormatted?: string | null
  /** When set, renders the inline CallRecordingPlayer + reserves space for
   *  the Summ/L/A/webhook placeholder buttons. */
  callIdForRecording?: string | null
  hasRecording?: boolean
  /** Display timestamp (already formatted in the company timezone). */
  timestamp: string
  /** Optional link to the lead's detail page so the row is clickable. */
  leadHref?: string | null
}

function ChannelIcon({ channel, direction }: { channel: string; direction?: string | null }) {
  if (channel === 'CALL') {
    if (direction === 'INBOUND') return <PhoneIncoming className="w-4 h-4 text-emerald-700" />
    if (direction === 'OUTBOUND') return <PhoneOutgoing className="w-4 h-4 text-emerald-700" />
    return <PhoneMissed className="w-4 h-4 text-rose-700" />
  }
  if (channel === 'SMS') return <MessageSquare className="w-4 h-4 text-blue-700" />
  if (channel === 'EMAIL') return <Mail className="w-4 h-4 text-purple-700" />
  return <FileText className="w-4 h-4 text-gray-600" />
}

function iconBoxClass(channel: string): string {
  switch (channel) {
    case 'CALL':
      return 'bg-emerald-50'
    case 'SMS':
      return 'bg-blue-50'
    case 'EMAIL':
      return 'bg-purple-50'
    default:
      return 'bg-gray-50'
  }
}

function formatPhone(raw: string | null | undefined): string {
  if (!raw) return ''
  const digits = raw.replace(/[^\d]/g, '')
  if (raw.startsWith('+1') && digits.length === 11) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return raw
}

export function ActivityRow(props: ActivityRowProps) {
  const {
    channel,
    direction,
    primary,
    name,
    byName,
    bySecondary,
    toSecondary,
    body,
    outcomeLabel,
    outcomeKind,
    costFormatted,
    callIdForRecording,
    hasRecording,
    timestamp,
    leadHref,
  } = props

  const isCall = channel === 'CALL'
  const isSms = channel === 'SMS'
  const isEmail = channel === 'EMAIL'

  const headerLine = (
    <div className="flex items-baseline gap-2 flex-wrap">
      <span className="font-semibold text-gray-900">
        {primary ? formatPhone(primary) : '—'}
      </span>
      {name && <>
        <span className="text-gray-400 text-xs">•</span>
        <span className="text-gray-700 text-sm">{name}</span>
      </>}
    </div>
  )

  return (
    <div className="px-5 py-3 flex items-start gap-3 group">
      <div className={`w-9 h-9 rounded-lg ${iconBoxClass(channel)} flex items-center justify-center flex-shrink-0 mt-0.5`}>
        <ChannelIcon channel={channel} direction={direction ?? null} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {leadHref ? (
              <Link href={leadHref} className="hover:underline">
                {headerLine}
              </Link>
            ) : headerLine}

            {/* By/To line — variants for call (By only), sms (By + To), email (To). */}
            {(byName || toSecondary) && (
              <div className="flex items-baseline gap-1.5 flex-wrap mt-0.5 text-xs text-gray-500">
                {byName && <>
                  <span className="font-semibold text-gray-700">By: {byName}</span>
                  {bySecondary && <>
                    <span className="text-gray-300">•</span>
                    <span className="font-mono text-gray-500">{formatPhone(bySecondary)}</span>
                  </>}
                </>}
                {!byName && toSecondary && <>
                  <span className="font-semibold text-gray-700">To:</span>
                  <span className="font-mono text-gray-500">{formatPhone(toSecondary)}</span>
                </>}
              </div>
            )}

            {/* Outcome label (calls). */}
            {outcomeLabel && (
              <div className="mt-0.5">
                <span className={`text-xs font-semibold ${
                  outcomeKind === 'connected' ? 'text-emerald-700' :
                  outcomeKind === 'not-connected' ? 'text-rose-700' :
                  'text-gray-700'
                }`}>
                  {outcomeLabel}
                </span>
              </div>
            )}

            {/* Body — SMS / email / note text. */}
            {body && !isCall && (
              <p className="text-sm text-gray-800 mt-1 leading-snug whitespace-pre-wrap break-words">
                {body}
              </p>
            )}
          </div>

          <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">{timestamp}</span>
        </div>

        {/* Recording player (calls). Renders inline only when a
            recording exists so missed/no-answer calls don't show an
            empty player. */}
        {isCall && hasRecording && callIdForRecording && (
          <div className="mt-2">
            <CallRecordingPlayer callId={callIdForRecording} />
          </div>
        )}

        {/* Cost row — separate small pill so it doesn't crowd the
            outcome label. Only renders when a cost was captured. */}
        {isCall && costFormatted && (
          <div className="mt-1.5">
            <span className="inline-flex items-center text-[11px] font-mono bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">
              Cost {costFormatted}
            </span>
          </div>
        )}

        {/* Summary placeholder buttons — visual only for now; the
            actions are wired in a later iteration ("we'll work on
            later" per the spec). */}
        {(isCall || isSms || isEmail) && (
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border border-pink-200 text-pink-600 bg-white hover:bg-pink-50 disabled:cursor-default disabled:opacity-80"
              title="Generate AI summary (coming soon)"
            >
              <Sparkles className="w-3 h-3" />
              Summ.
            </button>
            <button
              type="button"
              disabled
              className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border border-gray-200 text-gray-500 bg-white disabled:cursor-default disabled:opacity-80"
              title="Lead status update (coming soon)"
            >
              L: -
            </button>
            <button
              type="button"
              disabled
              className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border border-gray-200 text-gray-500 bg-white disabled:cursor-default disabled:opacity-80"
              title="Action items (coming soon)"
            >
              A: -
            </button>
            <button
              type="button"
              disabled
              className="inline-flex items-center text-[11px] font-medium px-1.5 py-0.5 rounded-full border border-gray-200 text-gray-500 bg-white disabled:cursor-default disabled:opacity-80"
              title="Trigger webhook (coming soon)"
            >
              <Webhook className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Quick link icon for rows that have a lead context. */}
      {leadHref && (
        <Link
          href={leadHref}
          className="text-gray-300 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-2"
          title="Open lead detail"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
  )
}
