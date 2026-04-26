import imapSimple from 'imap-simple'
import { simpleParser } from 'mailparser'
import { Contact, PropertyContact, Property, Message } from '@crm/database'

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

        const contactRow = await Contact.findOne({
          where: { email: fromAddress },
          include: [
            {
              model: PropertyContact,
              as: 'properties',
              where: { isPrimary: true },
              required: false,
              separate: true,
              limit: 1,
              order: [['createdAt', 'DESC']],
              include: [{ model: Property, as: 'property', attributes: ['id'] }],
            },
          ],
        })

        const contact = contactRow?.get({ plain: true }) as any
        const propertyId = contact?.properties?.[0]?.property?.id

        await Message.create({
          ...(propertyId ? { propertyId } : {}),
          channel: 'EMAIL',
          direction: 'INBOUND',
          subject: parsed.subject ?? undefined,
          body: parsed.text ?? parsed.html ?? '',
          from: fromAddress,
          emailMessageId: parsed.messageId ?? undefined,
        } as any)

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
