import { ActivityLog, Property, User, Message, ActiveCall, Contact, Op } from '@crm/database'
import type { WhereOptions } from '@crm/database'
import { getActiveCommConfig } from '@/lib/comm-provider'

export interface ActivityFeedFilter {
  propertyId?: string
  userId?: string
  page?: number
  pageSize?: number
}

export interface ActivityFeedRow {
  id: string
  propertyId: string | null
  userId: string | null
  userName: string | null
  action: string
  actorType: string
  detail: Record<string, unknown>
  createdAt: Date
  user: { id: string; name: string; avatarUrl: string | null } | null
  property: {
    id: string
    streetAddress: string | null
    city: string | null
    state: string | null
    leadType: 'DIRECT_TO_SELLER' | 'DIRECT_TO_AGENT'
  } | null
}

export async function getActivityFeed(
  filter: ActivityFeedFilter,
): Promise<ActivityFeedRow[]> {
  const { propertyId, userId, page = 1, pageSize = 50 } = filter

  const where: WhereOptions = {}
  if (propertyId) (where as any).propertyId = propertyId
  if (userId) (where as any).userId = userId

  const rows = await ActivityLog.findAll({
    where,
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'avatarUrl'],
      },
      {
        model: Property,
        as: 'property',
        attributes: ['id', 'streetAddress', 'city', 'state', 'leadType'],
      },
    ],
    order: [['createdAt', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
    raw: true,
    nest: true,
  })
  return rows as unknown as ActivityFeedRow[]
}

export interface CommsRow {
  id: string
  channel: string
  direction: string
  body: string | null
  subject: string | null
  from: string | null
  to: string | null
  twilioSid: string | null
  createdAt: Date
  property: {
    id: string
    streetAddress: string | null
    city: string | null
    state: string | null
    leadType: 'DIRECT_TO_SELLER' | 'DIRECT_TO_AGENT'
    propertyStatus: string
  } | null
  contact: { id: string; firstName: string | null; lastName: string | null } | null
  sentBy: { id: string; name: string; phone: string | null } | null
  /** ActiveCall enrichment for CALL channel rows. */
  callCost: number | null
  callCostCurrency: string | null
  callHasRecording: boolean
  callDurationSec: number | null
  callStatus: string | null
  /** SMS delivery status: SENT | DELIVERED | FAILED | UNDELIVERED */
  status: string | null
  /** Provider error detail when status is FAILED/UNDELIVERED. */
  failReason: string | null
}

/**
 * Fetch recent CALL/SMS/EMAIL Messages enriched with ActiveCall data
 * (cost, recording, status). Used by the /activity page so call cost
 * and inline recording players surface in the global feed without
 * needing a separate "Recent Calls" panel.
 *
 * Joined via twilioSid → ActiveCall.id (the disposition save path)
 * and fanned-out so the activity row can render an inline player.
 */
export async function getRecentComms(limit = 100): Promise<CommsRow[]> {
  const messages = await Message.findAll({
    where: { channel: { [Op.in]: ['CALL', 'SMS', 'EMAIL'] } },
    include: [
      {
        model: Property,
        as: 'property',
        attributes: ['id', 'streetAddress', 'city', 'state', 'leadType', 'propertyStatus'],
      },
      {
        model: Contact,
        as: 'contact',
        attributes: ['id', 'firstName', 'lastName'],
      },
      {
        model: User,
        as: 'sentBy',
        attributes: ['id', 'name', 'phone'],
      },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    raw: true,
    nest: true,
  }) as any[]

  // Bulk-load ActiveCall rows for any CALL messages that have a
  // twilioSid (= ActiveCall.id stamped by the disposition modal /
  // call.hangup webhook). One round-trip for the whole page.
  const callIds = Array.from(
    new Set(
      messages
        .filter((m) => m.channel === 'CALL' && m.twilioSid)
        .map((m) => m.twilioSid as string),
    ),
  )
  const callsById = new Map<string, any>()
  if (callIds.length > 0) {
    const calls = await ActiveCall.findAll({
      where: { id: callIds },
      attributes: [
        'id',
        'cost',
        'costCurrency',
        'recordingStorageKey',
        'startedAt',
        'endedAt',
        'status',
        // Needed for the read-time From/To fallback below.
        'crmNumber',
        'customerPhone',
        'direction',
      ],
      raw: true,
    }) as any[]
    for (const c of calls) callsById.set(c.id, c)
  }

  // Fallback for the CRM-side number when an old ActiveCall row was
  // created before crmNumber persistence existed. Uses the active
  // comm provider's default outbound number — same value the SDK
  // would have actually dialed from.
  const commDefault = (await getActiveCommConfig())?.defaultNumber ?? null

  return messages.map((m) => {
    const callRow = m.channel === 'CALL' && m.twilioSid ? callsById.get(m.twilioSid) : null
    const durationSec = callRow?.startedAt && callRow?.endedAt
      ? Math.max(0, Math.round((new Date(callRow.endedAt).getTime() - new Date(callRow.startedAt).getTime()) / 1000))
      : null

    // Read-time From/To enrichment for CALL messages whose Message
    // row was saved before the auto-fill landed. We derive from the
    // ActiveCall (and ultimately the comm provider default) so the
    // activity row never goes blank for a known call.
    let derivedFrom = m.from
    let derivedTo = m.to
    if (m.channel === 'CALL' && callRow && (!derivedFrom || !derivedTo)) {
      const isInbound = (callRow.direction ?? m.direction) === 'INBOUND'
      const crm = callRow.crmNumber || commDefault
      const customer = callRow.customerPhone
      if (!derivedFrom) derivedFrom = isInbound ? customer : crm
      if (!derivedTo) derivedTo = isInbound ? crm : customer
    }

    return {
      id: m.id,
      channel: m.channel,
      direction: m.direction,
      body: m.body,
      subject: m.subject,
      from: derivedFrom,
      to: derivedTo,
      twilioSid: m.twilioSid,
      createdAt: m.createdAt,
      property: m.property?.id ? m.property : null,
      contact: m.contact?.id ? m.contact : null,
      sentBy: m.sentBy?.id ? m.sentBy : null,
      callCost: callRow?.cost != null ? Number(callRow.cost) : null,
      callCostCurrency: callRow?.costCurrency ?? null,
      callHasRecording: !!callRow?.recordingStorageKey,
      callDurationSec: durationSec,
      callStatus: callRow?.status ?? null,
      status: m.status ?? null,
      failReason: m.failReason ?? null,
    }
  })
}
