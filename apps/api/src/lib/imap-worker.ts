/**
 * IMAP inbound email worker
 *
 * Polls a shared IMAP inbox every 5 minutes via BullMQ repeat job.
 * Matches sender email to a Contact → finds linked Property.
 * Creates an inbound Message record for each new email.
 *
 * Config via environment variables:
 *   IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASS, IMAP_TLS (true/false)
 */

import imapSimple from 'imap-simple'
import { simpleParser } from 'mailparser'
import { prisma } from './prisma.js'

export async function syncInboundEmails(): Promise<void> {
  const host = process.env.IMAP_HOST
  if (!host) {
    console.log('[imap] IMAP_HOST not set — skipping sync')
    return
  }

  const config = {
    imap: {
      host,
      port: parseInt(process.env.IMAP_PORT ?? '993'),
      tls: process.env.IMAP_TLS !== 'false',
      user: process.env.IMAP_USER ?? '',
      password: process.env.IMAP_PASS ?? '',
      authTimeout: 10000,
    },
  }

  let connection: imapSimple.ImapSimple | null = null
  try {
    connection = await imapSimple.connect(config)
    await connection.openBox('INBOX')

    // Fetch unseen emails from the last 24h
    const since = new Date()
    since.setDate(since.getDate() - 1)

    const results = await connection.search(['UNSEEN', ['SINCE', since.toDateString()]], {
      bodies: ['HEADER', 'TEXT', ''],
      markSeen: true,
    })

    for (const item of results) {
      try {
        const allParts = imapSimple.getParts(item.attributes.struct ?? [])
        const bodyPart = allParts.find((p: any) => p.which === '')

        if (!bodyPart) continue

        const rawBody = await connection!.getPartData(item, bodyPart)
        const parsed = await simpleParser(rawBody as string)

        const fromAddress =
          Array.isArray(parsed.from?.value)
            ? parsed.from!.value[0]?.address ?? null
            : null

        if (!fromAddress) continue

        // Try to match sender to a Contact
        const contact = await prisma.contact.findFirst({
          where: { email: fromAddress },
          include: {
            properties: {
              where: { isPrimary: true },
              include: { property: { select: { id: true } } },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        })

        const propertyId = contact?.properties[0]?.property.id

        // Create inbound Message record
        await prisma.message.create({
          data: {
            ...(propertyId ? { propertyId } : {}),
            channel: 'EMAIL',
            direction: 'INBOUND',
            subject: parsed.subject ?? undefined,
            body: parsed.text ?? parsed.html ?? '',
            from: fromAddress,
            emailMessageId: parsed.messageId ?? undefined,
          } as any,
        })

        console.log(`[imap] inbound email from ${fromAddress}, property: ${propertyId ?? 'unmatched'}`)
      } catch (msgErr) {
        console.error('[imap] error processing message:', msgErr)
      }
    }
  } catch (err) {
    console.error('[imap] sync error:', err)
  } finally {
    connection?.end()
  }
}
