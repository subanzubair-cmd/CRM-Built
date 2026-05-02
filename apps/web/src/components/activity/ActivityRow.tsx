'use client'

import {
  PhoneOutgoing,
  PhoneIncoming,
  PhoneMissed,
  MessageSquare,
  Mail,
  FileText,
  ExternalLink,
  Sparkles,
  Check,
  CheckCheck,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { CallRecordingPlayer } from '@/components/calls/CallRecordingPlayer'

/**
 * ActivityRow — minimal, tight, single-row activity entry shared by
 * `/activity` and the lead-detail Comm & Notes timeline.
 *
 * Design principles:
 *   - Tiny channel icon in a soft circle (no oversized colored boxes).
 *   - Single bold headline (counterparty name OR direction verb when
 *     no name resolves — never duplicated with the From/To meta).
 *   - One thin meta line of dot-separated facts.
 *   - Live actions (recording player, cost) and AI placeholders sit on
 *     a compact row that wraps + clips inside the parent container so
 *     the recording player never bleeds past the right edge.
 */

export interface ActivityRowProps {
  channel: string
  direction?: 'INBOUND' | 'OUTBOUND' | string | null
  /** Counterparty primary identifier (phone or email). */
  primary: string | null
  /** Counterparty name (resolved contact). */
  name?: string | null
  /** Sender phone or email — ALWAYS rendered when provided. */
  fromAddress?: string | null
  /** Recipient phone or email — ALWAYS rendered when provided. */
  toAddress?: string | null
  /** Sender display ("By <name>") — typically only for outbound. */
  byName?: string | null
  /** Body text — main message content for SMS/email/note. */
  body?: string | null
  /** Optional outcome line — colored inline label, calls only. */
  outcomeLabel?: string | null
  outcomeKind?: 'connected' | 'not-connected' | null
  /** Cost line — already formatted ("$0.0042"). */
  costFormatted?: string | null
  /** When set, renders the inline CallRecordingPlayer. */
  callIdForRecording?: string | null
  hasRecording?: boolean
  /** Display timestamp (already formatted in the company timezone). */
  timestamp: string
  /** Optional link to the lead's detail page so the row is clickable. */
  leadHref?: string | null
  /**
   * SMS delivery lifecycle: SENT = dispatched, DELIVERED = carrier confirmed,
   * FAILED / UNDELIVERED = error. For CALL messages FAILED means the call
   * was not answered (outbound) or missed (inbound).
   */
  messageStatus?: string | null
  /** Provider error detail shown on hover when messageStatus is FAILED. */
  deliveryFailReason?: string | null
}

function ChannelIcon({
  channel,
  direction,
  isMissed,
}: {
  channel: string
  direction?: string | null
  isMissed?: boolean
}) {
  // 12px icons keep the row compact. strokeWidth 1.75 reads as a
  // refined glyph rather than a chunky button.
  const props = { className: 'w-3 h-3', strokeWidth: 1.75 }
  if (channel === 'CALL') {
    if (isMissed) return <PhoneMissed {...props} />
    if (direction === 'INBOUND') return <PhoneIncoming {...props} />
    if (direction === 'OUTBOUND') return <PhoneOutgoing {...props} />
    return <PhoneMissed {...props} />
  }
  if (channel === 'SMS') return <MessageSquare {...props} />
  if (channel === 'EMAIL') return <Mail {...props} />
  return <FileText {...props} />
}

/** Channel-tinted icon — a soft circle with a colored glyph.
 *  Direction is the primary signal: INBOUND green / OUTBOUND blue
 *  across SMS, CALL, and EMAIL so the user can scan a long feed and
 *  see who reached out vs who was reached. An inbound CALL with no
 *  conversation evidence (no recording AND no disposition outcome) is
 *  treated as MISSED and gets the rose tint instead of green. */
function channelTheme(
  channel: string,
  direction?: string | null,
  isMissed?: boolean,
) {
  if (channel === 'CALL') {
    if (isMissed) return 'bg-rose-50 text-rose-700'
    if (direction === 'INBOUND') return 'bg-emerald-50 text-emerald-700'
    if (direction === 'OUTBOUND') return 'bg-sky-50 text-sky-700'
    return 'bg-rose-50 text-rose-700'
  }
  if (channel === 'SMS' || channel === 'EMAIL') {
    if (direction === 'INBOUND') return 'bg-emerald-50 text-emerald-700'
    return 'bg-sky-50 text-sky-700'
  }
  return 'bg-gray-50 text-gray-600'
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

function formatAddress(channel: string, raw: string | null | undefined): string {
  if (!raw) return ''
  if (channel === 'EMAIL') return raw
  return formatPhone(raw)
}

function directionVerb(channel: string, direction?: string | null, isMissed?: boolean): string {
  if (channel === 'CALL') {
    if (isMissed) {
      return direction === 'OUTBOUND' ? 'No answer' : 'Missed call'
    }
    if (direction === 'OUTBOUND') return 'Outbound call'
    if (direction === 'INBOUND') return 'Inbound call'
    return 'Missed call'
  }
  if (channel === 'SMS') return direction === 'OUTBOUND' ? 'Outbound SMS' : 'Inbound SMS'
  if (channel === 'EMAIL') return direction === 'OUTBOUND' ? 'Outbound email' : 'Inbound email'
  return 'Note'
}

function Dot() {
  return <span className="text-gray-300 select-none">·</span>
}

/** Inline SMS delivery status indicator — sits after the message body. */
function DeliveryStatusBadge({
  status,
  failReason,
}: {
  status: string | null | undefined
  failReason: string | null | undefined
}) {
  if (!status) return null
  if (status === 'SENT') {
    return (
      <span title="Sent — awaiting delivery confirmation" className="inline-flex items-center text-gray-400">
        <Check className="w-3 h-3" strokeWidth={2.5} />
      </span>
    )
  }
  if (status === 'DELIVERED') {
    return (
      <span title="Delivered" className="inline-flex items-center text-blue-500">
        <CheckCheck className="w-3.5 h-3.5" strokeWidth={2.5} />
      </span>
    )
  }
  if (status === 'FAILED' || status === 'UNDELIVERED') {
    return (
      <span
        title={failReason ? `Failed: ${failReason}` : 'Delivery failed'}
        className="inline-flex items-center gap-0.5 text-red-500"
      >
        <X className="w-3 h-3" strokeWidth={2.5} />
        <span className="text-[11px] font-medium">Failed</span>
      </span>
    )
  }
  return null
}

export function ActivityRow(props: ActivityRowProps) {
  const {
    channel,
    direction,
    primary,
    name,
    fromAddress,
    toAddress,
    byName,
    body,
    outcomeLabel,
    outcomeKind,
    costFormatted,
    callIdForRecording,
    hasRecording,
    timestamp,
    leadHref,
    messageStatus,
    deliveryFailReason,
  } = props

  const isCall = channel === 'CALL'
  const isSms = channel === 'SMS'
  const isEmail = channel === 'EMAIL'

  // A call with messageStatus=FAILED was not answered (set by the
  // Telnyx/Twilio webhook when the call ends without becoming ACTIVE).
  // Legacy inbound missed calls (no status set) fall back to the
  // heuristic: no recording + no disposition.
  const isFailedCall = isCall && messageStatus === 'FAILED'
  const isMissedByHeuristic =
    isCall &&
    direction === 'INBOUND' &&
    !hasRecording &&
    !outcomeLabel &&
    !messageStatus
  const isMissedCall = isFailedCall || isMissedByHeuristic

  const themeClass = channelTheme(channel, direction, isMissedCall)
  const verb = directionVerb(channel, direction ?? null, isMissedCall)
  const headline = name || verb
  const showVerbSuffix = !!name

  const fromFormatted = formatAddress(channel, fromAddress)
  const toFormatted = formatAddress(channel, toAddress)

  const fromToNode =
    fromFormatted || toFormatted ? (
      <span className="inline-flex items-baseline gap-1.5 flex-wrap">
        {fromFormatted && (
          <span className="inline-flex items-baseline gap-1">
            <span className="text-gray-400">From</span>
            <span className={`text-[12.5px] text-gray-700 ${isEmail ? '' : 'font-mono'}`}>
              {fromFormatted}
            </span>
          </span>
        )}
        {fromFormatted && toFormatted && <span className="text-gray-300">→</span>}
        {toFormatted && (
          <span className="inline-flex items-baseline gap-1">
            <span className="text-gray-400">To</span>
            <span className={`text-[12.5px] text-gray-700 ${isEmail ? '' : 'font-mono'}`}>
              {toFormatted}
            </span>
          </span>
        )}
      </span>
    ) : null

  // Missed calls: recolor the headline + the (optional) verb suffix
  // rose so the entire row's identity reads as "this was missed" at a
  // glance — not just the icon.
  const headlineColor = isMissedCall ? 'text-rose-700' : 'text-gray-900'
  const verbColor = isMissedCall ? 'text-rose-500' : 'text-gray-400'

  const headlineNode = (
    <span className="inline-flex items-baseline gap-1.5 min-w-0">
      <span className={`text-[13px] font-semibold ${headlineColor} truncate`}>{headline}</span>
      {showVerbSuffix && (
        <span className={`text-[11.5px] ${verbColor} whitespace-nowrap`}>· {verb}</span>
      )}
    </span>
  )

  // LEAD NOT-CONNECTED uses amber, NOT rose — rose is reserved for
  // missed calls. The two states are visually distinct now: missed =
  // "we never picked up" (red), not-connected = "we did pick up but
  // didn't reach the lead" (amber/warn).
  const outcomeColor =
    outcomeKind === 'connected'
      ? 'text-emerald-700'
      : outcomeKind === 'not-connected'
      ? 'text-amber-700'
      : 'text-gray-600'

  return (
    <div className="px-3 py-2 flex items-start gap-2.5 group hover:bg-gray-50/60 transition-colors">
      {/* Tiny channel chip — 20×20 dot with colored glyph. */}
      <div
        className={`w-5 h-5 rounded-full ${themeClass} flex items-center justify-center flex-shrink-0 mt-[3px]`}
      >
        <ChannelIcon channel={channel} direction={direction ?? null} isMissed={isMissedCall} />
      </div>

      {/* min-w-0 + overflow-hidden are what keep the recording player
          (and any long phone string) from bleeding past the right edge
          when the row sits in a narrow container. */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0 flex-1 truncate">
            {leadHref ? (
              <Link
                href={leadHref}
                className="hover:underline decoration-gray-300 underline-offset-2"
              >
                {headlineNode}
              </Link>
            ) : (
              headlineNode
            )}
          </div>
          <span className="text-[12.5px] text-gray-400 whitespace-nowrap flex-shrink-0" suppressHydrationWarning>
            {timestamp}
          </span>
        </div>

        {/* Meta — From → To plus By <Agent>. */}
        {(fromToNode || byName) && (
          <div className="text-[12.5px] text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
            {fromToNode}
            {fromToNode && byName && <Dot />}
            {byName && (
              <span className="inline-flex items-baseline gap-1">
                <span className="text-gray-400">By</span>
                <span className="text-gray-700">{byName}</span>
              </span>
            )}
          </div>
        )}

        {/* Outcome — calls only. Sized 2pt smaller than the headline
            so "LEAD CONNECTED / NOT-CONNECTED" sits as a tight,
            secondary status under the channel label rather than
            competing with it. */}
        {outcomeLabel && (
          <p className={`text-[11px] font-semibold mt-1 ${outcomeColor}`}>{outcomeLabel}</p>
        )}

        {/* Body — SMS / email text only. */}
        {body && !isCall && (
          <p className="text-[14.5px] text-gray-700 mt-1 leading-snug whitespace-pre-wrap break-words">
            {body}
            {isSms && direction === 'OUTBOUND' && (
              <span className="ml-1.5 inline-flex items-center align-middle">
                <DeliveryStatusBadge status={messageStatus} failReason={deliveryFailReason} />
              </span>
            )}
          </p>
        )}

        {/* Action row — recording player on its own row when present
            (so it can use the full available width without overflowing),
            cost + summary on a separate compact strip. */}
        {isCall && hasRecording && callIdForRecording && (
          <div className="mt-1.5 max-w-full overflow-hidden">
            <CallRecordingPlayer callId={callIdForRecording} />
          </div>
        )}

        {(isCall || isSms || isEmail) && (
          <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[12.5px]">
            {isCall && costFormatted && (
              <>
                <span className="font-mono text-emerald-700" title="Provider cost">
                  {costFormatted}
                </span>
                <Dot />
              </>
            )}
            <button
              type="button"
              disabled
              title="Generate AI summary (coming soon)"
              className="inline-flex items-center gap-1 text-pink-600 hover:text-pink-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Sparkles className="w-3 h-3" />
              <span className="font-medium">Summ.</span>
            </button>
          </div>
        )}
      </div>

      {leadHref && (
        <Link
          href={leadHref}
          className="text-gray-300 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1"
          title="Open lead detail"
        >
          <ExternalLink className="w-3 h-3" />
        </Link>
      )}
    </div>
  )
}
