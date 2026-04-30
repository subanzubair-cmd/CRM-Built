/**
 * Bulk SMS broadcast executor.
 *
 * One BullMQ job per recipient. The job:
 *   1. Loads BulkSmsBlastRecipient + parent BulkSmsBlast.
 *   2. Skips if status != 'QUEUED' (idempotent — protects against
 *      double-fan-out when the parent blast retries after a partial
 *      failure).
 *   3. Hard-checks DND on the recipient phone (existing dnd helper).
 *   4. Resolves the from-number from the parent blast's
 *      fromPhoneNumberId → TwilioNumber.number.
 *   5. Calls sendSms() (provider-agnostic).
 *   6. Persists a Message row linked to bulkSmsBlastId so the
 *      message timeline shows the blast lineage.
 *   7. Updates the recipient row status + providerMessageId and
 *      bumps the parent blast's sentCount.
 *   8. Catches any error and marks the recipient FAILED with the
 *      reason.
 *
 * The Telnyx delivery webhook flips SENT → DELIVERED / FAILED later
 * via providerMessageId lookup.
 */

import {
  BulkSmsBlast,
  BulkSmsBlastRecipient,
  Message,
  TwilioNumber,
  sequelize,
} from '@crm/database'
import { sendSms } from './sms-send.js'
import { checkDndByPhone } from './dnd.js'

export type BulkSmsJobData = {
  recipientId: string
}

export async function processBulkSmsJob(data: BulkSmsJobData): Promise<void> {
  const recipient = await BulkSmsBlastRecipient.findByPk(data.recipientId)
  if (!recipient) {
    console.warn(`[bulk-sms] recipient ${data.recipientId} not found, skipping`)
    return
  }

  // Idempotency: only process QUEUED rows. Anything else means
  // we've already tried (or it was cancelled).
  if (recipient.status !== 'QUEUED') {
    return
  }

  const blast = await BulkSmsBlast.findByPk(recipient.blastId)
  if (!blast) {
    await recipient.update({
      status: 'FAILED',
      failReason: 'Parent blast not found',
    } as any)
    return
  }

  if (blast.status === 'CANCELLED') {
    await recipient.update({ status: 'SKIPPED_INVALID', failReason: 'Blast cancelled' } as any)
    return
  }

  // DND guard — Bulk SMS is a marketing channel, opt-out trumps.
  const dndReason = await checkDndByPhone(recipient.phone, 'sms')
  if (dndReason) {
    await sequelize.transaction(async (t) => {
      await recipient.update(
        { status: 'SKIPPED_DND', failReason: `DND: ${dndReason}` } as any,
        { transaction: t },
      )
      await BulkSmsBlast.increment('failedCount', {
        by: 1,
        where: { id: blast.id },
        transaction: t,
      } as any)
    })
    await rollupBlastStatus(blast.id)
    return
  }

  // Resolve from-number — the blast stores phoneNumberId → TwilioNumber.
  let fromNumber: string | null = null
  if (blast.fromPhoneNumberId) {
    const tn = (await TwilioNumber.findByPk(blast.fromPhoneNumberId, {
      attributes: ['number'],
      raw: true,
    })) as { number: string } | null
    fromNumber = tn?.number ?? null
  }
  if (!fromNumber) {
    await recipient.update({
      status: 'FAILED',
      failReason: 'From number not resolvable',
    } as any)
    await BulkSmsBlast.increment('failedCount', { by: 1, where: { id: blast.id } } as any)
    await rollupBlastStatus(blast.id)
    return
  }

  // Send.
  try {
    const result = await sendSms({
      from: fromNumber,
      to: recipient.phone,
      text: blast.body,
    })

    // Persist Message row + update recipient + bump parent count
    // atomically so the timeline + dashboard counts agree even if
    // the worker is killed mid-update.
    await sequelize.transaction(async (t) => {
      const msg = await Message.create(
        {
          channel: 'SMS' as any,
          direction: 'OUTBOUND' as any,
          body: blast.body,
          from: fromNumber,
          to: recipient.phone,
          contactId: recipient.subjectType === 'CONTACT' ? recipient.subjectId : null,
          twilioSid: result.providerMessageId,
          bulkSmsBlastId: blast.id,
          sentById: blast.createdById,
        } as any,
        { transaction: t },
      )

      await recipient.update(
        {
          status: 'SENT',
          providerMessageId: result.providerMessageId,
          messageId: msg.id,
          sentAt: new Date(),
        } as any,
        { transaction: t },
      )

      await BulkSmsBlast.increment('sentCount', {
        by: 1,
        where: { id: blast.id },
        transaction: t,
      } as any)
    })
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await sequelize.transaction(async (t) => {
      await recipient.update(
        { status: 'FAILED', failReason: reason } as any,
        { transaction: t },
      )
      await BulkSmsBlast.increment('failedCount', {
        by: 1,
        where: { id: blast.id },
        transaction: t,
      } as any)
    })
  }

  await rollupBlastStatus(blast.id)
}

/**
 * If every recipient is in a terminal state, mark the parent blast
 * COMPLETED + stamp completedAt. Cheaper than running a periodic
 * sweep — we only check on every recipient finalization.
 */
async function rollupBlastStatus(blastId: string): Promise<void> {
  const [pending] = (await sequelize.query(
    `SELECT COUNT(*)::int AS pending
       FROM "BulkSmsBlastRecipient"
      WHERE "blastId" = :blastId
        AND "status" IN ('QUEUED','SENT')`,
    { replacements: { blastId }, plain: true },
  )) as any[]

  if (pending && pending.pending === 0) {
    await BulkSmsBlast.update(
      { status: 'COMPLETED', completedAt: new Date() } as any,
      { where: { id: blastId, status: ['QUEUED', 'SENDING'] as any } } as any,
    )
  }
}
