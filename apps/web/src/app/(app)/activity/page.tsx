import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getActivityFeed, getRecentComms, type CommsRow, type ActivityFeedRow } from '@/lib/activity'
import { formatDistanceToNow } from 'date-fns'
import { ActivityRow } from '@/components/activity/ActivityRow'

export const metadata = { title: 'Activity' }

function leadDetailUrl(p: { id: string; propertyStatus: string; leadType: string } | null): string | null {
  if (!p) return null
  const pipeline = p.leadType === 'DIRECT_TO_SELLER' ? 'dts' : 'dta'
  switch (p.propertyStatus) {
    case 'IN_TM':
      return `/tm/${p.id}`
    case 'IN_INVENTORY':
      return `/inventory/${p.id}`
    case 'IN_DISPO':
      return `/dispo/${p.id}`
    case 'SOLD':
      return `/sold/${p.id}`
    default:
      return `/leads/${pipeline}/${p.id}`
  }
}

/**
 * Pull the LEAD CONNECTED / NOT-CONNECTED outcome out of a disposition
 * Message body so we can render it as a colored secondary line.
 *
 * Disposition format (from CallDispositionModal):
 *   "LEAD CONNECTED (Other) — extra notes — (45s)"
 *   "LEAD NOT-CONNECTED (Other) — extra notes — (10s)"
 */
function parseCallOutcome(body: string | null): {
  label: string | null
  kind: 'connected' | 'not-connected' | null
} {
  if (!body) return { label: null, kind: null }
  const m = body.match(/^(LEAD (?:NOT-)?CONNECTED \([^)]+\))/i)
  if (!m) return { label: null, kind: null }
  const label = m[1]
  const kind = label.toUpperCase().includes('NOT-') ? 'not-connected' : 'connected'
  return { label, kind }
}

function formatCost(cost: number | null, currency: string | null): string | null {
  if (cost == null) return null
  const fixed = cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2)
  const isUsd = (currency ?? 'USD') === 'USD'
  return isUsd ? `$${fixed}` : `${fixed} ${currency}`
}

export default async function ActivityPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const [activityLogs, comms] = await Promise.all([
    getActivityFeed({ pageSize: 100 }),
    getRecentComms(100),
  ])

  // Merge the two feeds by createdAt so non-comm activity (lead
  // created, stage changed, etc.) interleaves with calls/SMS/email in
  // a single chronological list.
  type FeedItem =
    | { kind: 'activity'; createdAt: Date; row: ActivityFeedRow }
    | { kind: 'comm'; createdAt: Date; row: CommsRow }

  const items: FeedItem[] = [
    ...activityLogs
      .filter((a) => a.action !== 'MESSAGE_LOGGED') // CALL/SMS rows come from getRecentComms
      .map((a) => ({ kind: 'activity' as const, createdAt: new Date(a.createdAt), row: a })),
    ...comms.map((c) => ({ kind: 'comm' as const, createdAt: new Date(c.createdAt), row: c })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Activity</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-5">
        Recent comms + system events across all leads — calls + SMS + email +
        stage / status changes, newest first.
      </p>

      {items.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center h-48">
          <p className="text-sm text-gray-400">No activity yet</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50">
          {items.map((item) =>
            item.kind === 'comm' ? (
              <CommRow key={`c-${item.row.id}`} comm={item.row} />
            ) : (
              <ActivityLogRow key={`a-${item.row.id}`} log={item.row} />
            ),
          )}
        </div>
      )}
    </div>
  )
}

/** Render a CALL/SMS/EMAIL message in the unified icon-box format. */
function CommRow({ comm }: { comm: CommsRow }) {
  const isCall = comm.channel === 'CALL'
  const isOutbound = comm.direction === 'OUTBOUND'

  // Counterparty = the OTHER side of the message (not us).
  const primary = isOutbound ? comm.to : comm.from
  const counterpartyName = comm.contact
    ? `${comm.contact.firstName ?? ''} ${comm.contact.lastName ?? ''}`.trim()
    : null

  const { label: outcomeLabel, kind: outcomeKind } = isCall
    ? parseCallOutcome(comm.body)
    : { label: null, kind: null }

  return (
    <ActivityRow
      channel={comm.channel}
      direction={comm.direction}
      primary={primary ?? null}
      name={counterpartyName || undefined}
      byName={isOutbound ? (comm.sentBy?.name ?? null) : null}
      bySecondary={isOutbound ? (comm.sentBy?.phone ?? null) : null}
      toSecondary={!isOutbound ? null : comm.to ?? null}
      body={isCall ? null /* outcome line covers it */ : comm.body}
      outcomeLabel={outcomeLabel}
      outcomeKind={outcomeKind}
      costFormatted={isCall ? formatCost(comm.callCost, comm.callCostCurrency) : null}
      callIdForRecording={comm.twilioSid}
      hasRecording={isCall && comm.callHasRecording}
      timestamp={formatDistanceToNow(new Date(comm.createdAt), { addSuffix: true })}
      leadHref={leadDetailUrl(comm.property)}
    />
  )
}

/** Non-comm activity entry — lead created, stage changed, etc.
 *  Rendered in a simpler row since it's secondary. */
function ActivityLogRow({ log }: { log: ActivityFeedRow }) {
  const detail = log.detail as Record<string, unknown>
  const description = typeof detail?.description === 'string' ? detail.description : log.action
  return (
    <div className="px-5 py-3 flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-xs font-semibold text-gray-600">
          {log.user?.name?.[0] ?? '?'}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800">{description}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          {log.user?.name ?? 'System'}
          {log.property && (
            <> · {log.property.streetAddress ?? 'Unknown property'}</>
          )}
          {' · '}
          {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
        </p>
      </div>
    </div>
  )
}
