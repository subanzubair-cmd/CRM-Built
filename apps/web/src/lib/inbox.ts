import {
  Conversation,
  Message,
  Property,
  PropertyContact,
  Contact,
  User,
  Op,
  literal,
} from '@crm/database'
import type { WhereOptions, Includeable } from '@crm/database'

export type ChannelFilter = 'ALL' | 'SMS' | 'CALL' | 'NOTE'

export interface ConversationListFilter {
  unreadOnly?: boolean
  channel?: ChannelFilter
  page?: number
  pageSize?: number
  /**
   * When provided, restrict results to conversations on properties whose
   * marketId is in this array. Pass null/undefined to skip scoping (admin).
   */
  marketIds?: string[] | null
}

/**
 * Fetch conversation list with contact info, last message preview, and unread count.
 * Supports channel filtering by checking if the conversation has messages of that type.
 */
export async function getConversationList(filter: ConversationListFilter) {
  const { unreadOnly, channel = 'ALL', page = 1, pageSize = 50, marketIds } = filter

  // Build the conversation where. Channel filtering via "some" (Prisma) is
  // handled with a literal EXISTS subquery — we want conversations that
  // have at least one message of the chosen channel, but we DO NOT want to
  // restrict the eager-loaded messages to only that channel (the UI shows
  // the most recent message regardless).
  const where: WhereOptions = {}
  if (unreadOnly) (where as any).isRead = false
  if (channel !== 'ALL') {
    const channelCode = channel === 'NOTE' ? 'NOTE' : channel === 'CALL' ? 'CALL' : 'SMS'
    ;(where as any).id = {
      [Op.in]: literal(
        `(SELECT DISTINCT "conversationId" FROM "Message" WHERE "channel" = '${channelCode}' AND "conversationId" IS NOT NULL)`,
      ),
    }
  }

  // Property scoping: when marketIds is null/undefined → no scope (admin
  // sees everything). When [] → impossible filter (returns nothing). When
  // [...ids] → restrict via include.where on Property.
  const propertyInclude: Includeable = {
    model: Property,
    as: 'property',
    attributes: [
      'id',
      'streetAddress',
      'city',
      'state',
      'zip',
      'leadType',
      'propertyStatus',
    ],
    include: [
      {
        model: PropertyContact,
        as: 'contacts',
        where: { isPrimary: true },
        required: false,
        limit: 1,
        include: [
          {
            model: Contact,
            as: 'contact',
            attributes: ['id', 'firstName', 'lastName', 'phone', 'email'],
          },
        ],
      },
    ],
  }
  if (marketIds !== null && marketIds !== undefined) {
    ;(propertyInclude as any).required = true
    ;(propertyInclude as any).where =
      marketIds.length > 0
        ? { marketId: { [Op.in]: marketIds } }
        : { marketId: '__NO_MARKET__' }
  }

  const [rows, total] = await Promise.all([
    Conversation.findAll({
      where,
      include: [
        propertyInclude,
        // Last message — "separate: true" runs a second query per
        // conversation. Combined with limit:1 + reverse order this matches
        // the original `messages: { orderBy: desc, take: 1 }`.
        {
          model: Message,
          as: 'messages',
          separate: true,
          order: [['createdAt', 'DESC']],
          limit: 1,
          attributes: ['id', 'body', 'channel', 'createdAt'],
        },
      ],
      attributes: {
        // Replace Prisma's `_count: { messages: true }` and
        // `property._count.tasks` with correlated subqueries.
        include: [
          [
            literal(
              `(SELECT COUNT(*)::int FROM "Message" m WHERE m."conversationId" = "Conversation"."id")`,
            ),
            'messageCount',
          ],
          [
            literal(
              `(SELECT COUNT(*)::int FROM "Task" t WHERE t."propertyId" = "Conversation"."propertyId" AND t."status" = 'PENDING')`,
            ),
            'pendingTasksCount',
          ],
        ],
      },
      order: [['lastMessageAt', 'DESC']],
      offset: (page - 1) * pageSize,
      limit: pageSize,
      subQuery: false,
    }),
    Conversation.count({ where, distinct: true, col: 'id' }),
  ])

  // Re-shape into the legacy `_count` envelope so the inbox UI doesn't
  // need to change.
  const shaped = rows.map((row) => {
    const json = row.get({ plain: true }) as any
    return {
      ...json,
      _count: { messages: Number(json.messageCount ?? 0) },
      property: json.property
        ? {
            ...json.property,
            _count: { tasks: Number(json.pendingTasksCount ?? 0) },
          }
        : null,
    }
  })

  return { rows: shaped, total, page, pageSize }
}

export type ConversationRow = Awaited<ReturnType<typeof getConversationList>>['rows'][number]

export async function getConversationMessages(propertyId: string, limit = 200) {
  const messages = await Message.findAll({
    where: { propertyId },
    include: [{ model: User, as: 'sentBy', attributes: ['id', 'name'] }],
    order: [['createdAt', 'ASC']],
    limit,
    raw: true,
    nest: true,
  }) as any[]

  // For CALL messages, join ActiveCall on twilioSid (= ActiveCall.id)
  // and surface cost + recordingStorageKey + duration at read time.
  // Done in a single follow-up query rather than a Sequelize include
  // because the FK is conventional (twilioSid) rather than declared.
  const callIds = Array.from(
    new Set(
      messages
        .filter((m) => m.channel === 'CALL' && m.twilioSid)
        .map((m) => m.twilioSid as string),
    ),
  )
  if (callIds.length > 0) {
    const { ActiveCall } = await import('@crm/database')
    const calls = await ActiveCall.findAll({
      where: { id: callIds },
      attributes: ['id', 'cost', 'costCurrency', 'recordingStorageKey', 'startedAt', 'endedAt', 'status'],
      raw: true,
    }) as any[]
    const byId = new Map<string, any>(calls.map((c) => [c.id, c]))
    for (const m of messages) {
      if (m.channel === 'CALL' && m.twilioSid) {
        const c = byId.get(m.twilioSid)
        if (c) {
          m.callCost = c.cost != null ? Number(c.cost) : null
          m.callCostCurrency = c.costCurrency ?? null
          m.callHasRecording = !!c.recordingStorageKey
          m.callDurationSec = c.startedAt && c.endedAt
            ? Math.max(0, Math.round((new Date(c.endedAt).getTime() - new Date(c.startedAt).getTime()) / 1000))
            : null
          m.callStatus = c.status ?? null
        }
      }
    }
  }
  return messages
}

export type ConversationMessage = Awaited<ReturnType<typeof getConversationMessages>>[number]

/**
 * Fetch context data for the right panel: property + contact + task/lead counts.
 */
export async function getConversationContext(propertyId: string) {
  const property = await Property.findByPk(propertyId, {
    attributes: {
      include: [
        [
          literal(
            `(SELECT COUNT(*)::int FROM "Task" t WHERE t."propertyId" = "Property"."id" AND t."status" = 'PENDING')`,
          ),
          'pendingTasksCount',
        ],
        [
          literal(
            `(SELECT COUNT(*)::int FROM "Message" m WHERE m."propertyId" = "Property"."id")`,
          ),
          'messageCount',
        ],
        [
          literal(
            `(SELECT COUNT(*)::int FROM "Conversation" c WHERE c."propertyId" = "Property"."id")`,
          ),
          'conversationCount',
        ],
      ],
    },
    include: [
      { model: User, as: 'assignedTo', attributes: ['name'] },
      {
        model: PropertyContact,
        as: 'contacts',
        include: [
          {
            model: Contact,
            as: 'contact',
            attributes: [
              'id',
              'firstName',
              'lastName',
              'phone',
              'phone2',
              'email',
              'type',
            ],
          },
        ],
        order: [['isPrimary', 'DESC']],
      },
    ],
  })
  if (!property) return null

  const json = property.get({ plain: true }) as any
  return {
    ...json,
    _count: {
      tasks: Number(json.pendingTasksCount ?? 0),
      messages: Number(json.messageCount ?? 0),
      conversations: Number(json.conversationCount ?? 0),
    },
  }
}

export type ConversationContext = NonNullable<Awaited<ReturnType<typeof getConversationContext>>>
