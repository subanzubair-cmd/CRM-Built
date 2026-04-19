#!/usr/bin/env node
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
 */

import { PrismaClient } from '../packages/database/node_modules/.prisma/client/index.js'

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

async function main() {
  const orphans = await prisma.conversation.findMany({
    where: { contactId: null },
    select: { id: true, propertyId: true, lastMessageAt: true, createdAt: true },
  })

  console.log(`[backfill] ${orphans.length} orphaned conversations found`)

  let attached = 0
  let merged = 0
  let skipped = 0

  for (const conv of orphans) {
    const primary = await prisma.propertyContact.findFirst({
      where: { propertyId: conv.propertyId, isPrimary: true },
      select: { contactId: true },
    })
    if (!primary) {
      skipped++
      continue
    }

    // Does a conversation for this (property, contact) already exist?
    const existing = await prisma.conversation.findUnique({
      where: {
        propertyId_contactId: {
          propertyId: conv.propertyId,
          contactId: primary.contactId,
        },
      },
      select: { id: true, lastMessageAt: true },
    })

    if (existing && existing.id !== conv.id) {
      // Merge: move messages from orphan → existing, delete orphan
      await prisma.$transaction(async (tx) => {
        await tx.message.updateMany({
          where: { conversationId: conv.id },
          data: { conversationId: existing.id, contactId: primary.contactId },
        })
        // Keep the most recent lastMessageAt
        const keepLast =
          (conv.lastMessageAt?.getTime() ?? 0) > (existing.lastMessageAt?.getTime() ?? 0)
            ? conv.lastMessageAt
            : existing.lastMessageAt
        await tx.conversation.update({
          where: { id: existing.id },
          data: { lastMessageAt: keepLast },
        })
        await tx.conversation.delete({ where: { id: conv.id } })
      })
      merged++
    } else {
      // Simple attach: set contactId on the orphan and its messages
      await prisma.$transaction([
        prisma.conversation.update({
          where: { id: conv.id },
          data: { contactId: primary.contactId },
        }),
        prisma.message.updateMany({
          where: { conversationId: conv.id, contactId: null },
          data: { contactId: primary.contactId },
        }),
      ])
      attached++
    }
  }

  console.log(`[backfill] done — attached: ${attached}, merged: ${merged}, skipped (no primary contact): ${skipped}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
