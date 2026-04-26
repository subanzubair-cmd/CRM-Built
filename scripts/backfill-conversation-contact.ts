/**
 * Backfill Conversation.contactId from the primary PropertyContact.
 *
 * Existing conversations were created before per-contact threading and have
 * contactId=NULL. This script attaches each orphaned conversation to the
 * property's primary contact so the inbox shows a sensible owner.
 *
 * Idempotent: conversations that already have a contactId are skipped.
 * Conflicts (two NULL conversations collapsing to the same contactId) are
 * resolved by keeping the one with the most recent lastMessageAt.
 *
 * Usage: npx tsx scripts/backfill-conversation-contact.ts
 */
import 'reflect-metadata'
import { sequelize, Conversation, PropertyContact, Message } from '../packages/database/src'

async function main() {
  const orphans = await Conversation.findAll({
    where: { contactId: null },
    attributes: ['id', 'propertyId', 'lastMessageAt', 'createdAt'],
    raw: true,
  }) as unknown as Array<{
    id: string
    propertyId: string
    lastMessageAt: Date | null
    createdAt: Date
  }>

  console.log(`[backfill] ${orphans.length} orphaned conversations found`)

  let attached = 0
  let merged = 0
  let skipped = 0

  for (const conv of orphans) {
    const primary = await PropertyContact.findOne({
      where: { propertyId: conv.propertyId, isPrimary: true },
      attributes: ['contactId'],
      raw: true,
    }) as unknown as { contactId: string } | null
    if (!primary) {
      skipped++
      continue
    }

    const existing = await Conversation.findOne({
      where: { propertyId: conv.propertyId, contactId: primary.contactId },
      attributes: ['id', 'lastMessageAt'],
      raw: true,
    }) as unknown as { id: string; lastMessageAt: Date | null } | null

    if (existing && existing.id !== conv.id) {
      await sequelize.transaction(async (tx) => {
        await Message.update(
          { conversationId: existing.id, contactId: primary.contactId },
          { where: { conversationId: conv.id }, transaction: tx },
        )
        const orphanTs = conv.lastMessageAt ? new Date(conv.lastMessageAt).getTime() : 0
        const existingTs = existing.lastMessageAt ? new Date(existing.lastMessageAt).getTime() : 0
        const keepLast = orphanTs > existingTs ? conv.lastMessageAt : existing.lastMessageAt
        await Conversation.update(
          { lastMessageAt: keepLast },
          { where: { id: existing.id }, transaction: tx },
        )
        await Conversation.destroy({ where: { id: conv.id }, transaction: tx })
      })
      merged++
    } else {
      await sequelize.transaction(async (tx) => {
        await Conversation.update(
          { contactId: primary.contactId },
          { where: { id: conv.id }, transaction: tx },
        )
        await Message.update(
          { contactId: primary.contactId },
          { where: { conversationId: conv.id, contactId: null }, transaction: tx },
        )
      })
      attached++
    }
  }

  console.log(
    `[backfill] done — attached: ${attached}, merged: ${merged}, skipped (no primary contact): ${skipped}`,
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await sequelize.close()
  })
