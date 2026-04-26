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
  Webhook,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from 'lucide-react'
import Link from 'next/link'
import { CallRecordingPlayer } from '@/components/calls/CallRecordingPlayer'

/**
 * ActivityRow — unified row used by `/activity` and the lead-detail
 * Comm & Notes timeline. Everything channel-specific is data-driven so
 * the same component renders inbound/outbound calls, SMS, emails, and
 * notes consistently:
 *
 *   ┌──────┬───────────────────────────────────────────────┐
 *   │ icon │ Counterparty (name or phone) │  timestamp     │
 *   │ box  │ ↳ phone arrow secondary                       │
 *   │      │ By <agent> · <agent phone>                    │
 *   │      │ [✓ LEAD CONNECTED (Other)]                    │
 *   │      │ <body, sms/email/note text>                   │
 *   │      │ [▶ Play] [Cost $] · [✨ Summ.] [L:-] [A:-] [🪝]│
 *   └──────┴───────────────────────────────────────────────┘
 */

export interface ActivityRowProps {
  channel: string
  direction?: 'INBOUND' | 'OUTBOUND' | string | null
  /** Counterparty primary identifier (phone or email). */
  primary: string | null
  /** Counterparty name (resolved contact). */
  name?: string | null
  /** Sender display ("By <name>") for outbound messages. */
  byName?: string | null
  /** Sender phone/email for outbound. */
  bySecondary?: string | null
  /** Recipient identifier ("To <number>") for outbound SMS/email. */
  toSecondary?: string | null
  /** Body text — main message content for SMS/email/note. */
  body?: string | null
  /** Optional outcome line shown as a chip below the header. */
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
}

function ChannelIcon({ channel, direction }: { channel: string; direction?: string | null }) {
  if (channel === 'CALL') {
    if (direction === 'INBOUND') return <PhoneIncoming className="w-4 h-4" strokeWidth={2.25} />
    if (direction === 'OUTBOUND') return <PhoneOutgoing className="w-4 h-4" strokeWidth={2.25} />
    return <PhoneMissed className="w-4 h-4" strokeWidth={2.25} />
  }
  if (channel === 'SMS') return <MessageSquare className="w-4 h-4" strokeWidth={2.25} />
  if (channel === 'EMAIL') return <Mail className="w-4 h-4" strokeWidth={2.25} />
  return <FileText className="w-4 h-4" strokeWidth={2.25} />
}

/** Per-channel colors for the icon box + icon stroke. */
function channelTheme(channel: string, direction?: string | null) {
  if (channel === 'CALL') {
    if (direction === 'INBOUND') {
      return { box: 'bg-emerald-50 ring-1 ring-emerald-100', icon: 'text-emerald-700' }
    }
    if (direction === 'OUTBOUND') {
      return { box: 'bg-sky-50 ring-1 ring-sky-100', icon: 'text-sky-700' }
    }
    return { box: 'bg-rose-50 ring-1 ring-rose-100', icon: 'text-rose-700' }
  }
  if (channel === 'SMS') return { box: 'bg-blue-50 ring-1 ring-blue-100', icon: 'text-blue-700' }
  if (channel === 'EMAIL') return { box: 'bg-violet-50 ring-1 ring-violet-100', icon: 'text-violet-700' }
  return { box: 'bg-gray-50 ring-1 ring-gray-100', icon: 'text-gray-600' }
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

/** Outcome chip — colored capsule for LEAD CONNECTED / NOT-CONNECTED. */
function OutcomeChip({
  label,
  kind,
}: {
  label: string
  kind: 'connected' | 'not-connected' | null
}) {
  const isConnected = kind === 'connected'
  const isNot = kind === 'not-connected'
  const cls = isConnected
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : isNot
    ? 'bg-rose-50 text-rose-700 ring-rose-200'
    : 'bg-gray-50 text-gray-700 ring-gray-200'
  const Icon = isConnected ? CheckCircle2 : isNot ? XCircle : null
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ring-1 ${cls}`}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {label}
    </span>
  )
}

/** Small disabled "coming soon" pill — used for the summary placeholder
 *  buttons until those features are wired. Faded but uniform so they
 *  don't fight the live actions for attention. */
function PlaceholderPill({
  children,
  title,
  tone = 'neutral',
}: {
  children: React.ReactNode
  title: string
  tone?: 'neutral' | 'pink'
}) {
  const cls =
    tone === 'pink'
      ? 'border-pink-200 text-pink-600 hover:bg-pink-50'
      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
  return (
    <button
      type="button"
      disabled
      title={title + ' (coming soon)'}
      className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border bg-white transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${cls}`}
    >
      {children}
    </button>
  )
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
  const theme = channelTheme(channel, direction)

  // Compute the headline: prefer the resolved counterparty name if we
  // have one. Phone becomes the secondary line when name is shown.
  const formattedPrimary = primary ? formatPhone(primary) : null
  const headline = name || formattedPrimary || '—'
  const showSecondaryPhone = !!name && !!formattedPrimary

  const directionVerb = isCall
    ? direction === 'OUTBOUND'
      ? 'Outbound call'
      : direction === 'INBOUND'
      ? 'Inbound call'
      : 'Missed call'
    : isSms
    ? direction === 'OUTBOUND'
      ? 'Outbound SMS'
      : 'Inbound SMS'
    : isEmail
    ? direction === 'OUTBOUND'
      ? 'Outbound email'
      : 'Inbound email'
    : 'Note'

  const headlineNode = (
    <div className="flex items-baseline gap-2 flex-wrap min-w-0">
      <span className="font-semibold text-gray-900 truncate">{headline}</span>
      <span className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">
        {directionVerb}
      </span>
    </div>
  )

  return (
    <div className="px-5 py-4 flex items-start gap-3.5 group hover:bg-gray-50/40 transition-colors">
      <div
        className={`w-10 h-10 rounded-xl ${theme.box} flex items-center justify-center flex-shrink-0 mt-0.5 ${theme.icon}`}
      >
        <ChannelIcon channel={channel} direction={direction ?? null} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {leadHref ? (
              <Link href={leadHref} className="hover:underline decoration-gray-300 underline-offset-2">
                {headlineNode}
              </Link>
            ) : (
              headlineNode
            )}

            {/* Secondary phone — shown only when we already used the
                name as the headline. Avoids printing the number twice. */}
            {showSecondaryPhone && (
              <p className="text-xs font-mono text-gray-500 mt-0.5">{formattedPrimary}</p>
            )}

            {/* Agent + recipient meta. Calls only have "By"; outbound
                SMS/email also show a "→ To" leg so the path is clear. */}
            {(byName || toSecondary) && (
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5 flex-wrap">
                {byName && (
                  <>
                    <span className="text-gray-400">By</span>
                    <span className="font-medium text-gray-700">{byName}</span>
                    {bySecondary && (
                      <span className="font-mono text-gray-400">· {formatPhone(bySecondary)}</span>
                    )}
                  </>
                )}
                {byName && toSecondary && <ArrowRight className="w-3 h-3 text-gray-300" />}
                {toSecondary && (
                  <>
                    <span className="text-gray-400">To</span>
                    <span className="font-mono text-gray-600">{formatPhone(toSecondary)}</span>
                  </>
                )}
              </p>
            )}

            {/* Outcome chip (calls only). */}
            {outcomeLabel && (
              <div className="mt-2">
                <OutcomeChip label={outcomeLabel} kind={outcomeKind ?? null} />
              </div>
            )}

            {/* Body — SMS / email text. Notes use a separate row. */}
            {body && !isCall && (
              <p className="text-sm text-gray-800 mt-2 leading-relaxed whitespace-pre-wrap break-words">
                {body}
              </p>
            )}
          </div>

          <span className="text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0 mt-0.5">
            {timestamp}
          </span>
        </div>

        {/* Action row: live affordances first (recording, cost), then a
            soft divider, then the AI/automation placeholders. Single
            line so the row stays compact. */}
        {(isCall || isSms || isEmail) && (
          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
            {isCall && hasRecording && callIdForRecording && (
              <CallRecordingPlayer callId={callIdForRecording} />
            )}
            {isCall && costFormatted && (
              <span
                className="inline-flex items-center text-[11px] font-mono font-medium bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full ring-1 ring-emerald-100"
                title="Provider cost for this call"
              >
                {costFormatted}
              </span>
            )}
            {/* Visual divider between live actions and placeholders.
                Hidden when there are no live actions to avoid an
                orphan separator. */}
            {(isCall && (hasRecording || costFormatted)) && (
              <span className="h-3 w-px bg-gray-200 mx-0.5" aria-hidden />
            )}
            <PlaceholderPill title="Generate AI summary" tone="pink">
              <Sparkles className="w-3 h-3" />
              Summ.
            </PlaceholderPill>
            <PlaceholderPill title="Lead status update">L: -</PlaceholderPill>
            <PlaceholderPill title="Action items">A: -</PlaceholderPill>
            <PlaceholderPill title="Trigger webhook">
              <Webhook className="w-3 h-3" />
            </PlaceholderPill>
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
