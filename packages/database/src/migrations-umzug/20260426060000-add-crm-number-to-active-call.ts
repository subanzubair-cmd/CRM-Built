/**
 * Add `crmNumber` column to ActiveCall — the CRM-side phone number
 * involved in the call.
 *
 *   For OUTBOUND: the agent's outbound caller-ID (the number we dialed
 *                 FROM). Captured by /api/calls/start.
 *   For INBOUND : the CRM number that received the call (the number we
 *                 were dialed AT). Captured by the Telnyx call.initiated
 *                 webhook from `payload.to[0].phone_number`.
 *
 * Used by /api/messages to auto-fill Message.from / Message.to for CALL
 * messages so the activity feed always shows both sides regardless of
 * direction. Without this column we'd only have `customerPhone` (the
 * other party) and the row would render with one side blank.
 */
import type { MigrationFn } from 'umzug'
import type { QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    ALTER TABLE "ActiveCall"
      ADD COLUMN IF NOT EXISTS "crmNumber" TEXT;
  `)
}

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    ALTER TABLE "ActiveCall" DROP COLUMN IF EXISTS "crmNumber";
  `)
}
