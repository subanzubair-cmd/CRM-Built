import {
  Conversation,
  Property,
  Op,
  literal,
} from '@crm/database'
import type { WhereOptions } from '@crm/database'

export async function getEmailConversations(filter: { page?: number; pageSize?: number } = {}) {
  const { page = 1, pageSize = 25 } = filter

  const where: WhereOptions = {
    id: {
      [Op.in]: literal(
        `(SELECT DISTINCT "conversationId" FROM "Message" WHERE "channel" = 'EMAIL' AND "conversationId" IS NOT NULL)`,
      ),
    },
  }

  const [rows, total] = await Promise.all([
    Conversation.findAll({
      where,
      attributes: {
        include: [
          [
            literal(`(SELECT COUNT(*) FROM "Message" m WHERE m."conversationId" = "Conversation"."id" AND m."channel" = 'EMAIL')`),
            '_count_messages',
          ],
        ],
      },
      include: [
        {
          model: Property,
          as: 'property',
          attributes: ['id', 'streetAddress', 'city', 'leadType', 'propertyStatus'],
        },
      ],
      order: [['lastMessageAt', 'DESC']],
      offset: (page - 1) * pageSize,
      limit: pageSize,
      subQuery: false,
    }),
    Conversation.count({ where }),
  ])

  const shaped = rows.map((row) => {
    const obj = row.get({ plain: true }) as Record<string, any>
    obj._count = { messages: Number(obj._count_messages ?? 0) }
    delete obj._count_messages
    return obj
  })

  return { rows: shaped, total }
}
