/**
 * Adds per-call cost capture so the CRM can surface what each call cost
 * with the active provider (Telnyx, Twilio, Signal House).
 *
 *   ActiveCall.cost           NUMERIC(10,4) — cost in the call's currency
 *   ActiveCall.costCurrency   TEXT          — ISO-4217 (default 'USD')
 *
 *   CommProviderConfig.enableCallCost BOOL  — toggle (default false)
 *
 * The Telnyx webhook handler reads enableCallCost on `call.hangup`. If
 * true, it writes payload.cost / payload.cost_currency (when present)
 * and schedules an out-of-band fetch from the Telnyx CDR API as a
 * fallback for cases where cost isn't pushed inline.
 */
import type { MigrationFn } from 'umzug'
import type { QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    ALTER TABLE "ActiveCall"
      ADD COLUMN IF NOT EXISTS "cost" NUMERIC(10,4),
      ADD COLUMN IF NOT EXISTS "costCurrency" TEXT;
  `)
  await context.sequelize.query(`
    ALTER TABLE "CommProviderConfig"
      ADD COLUMN IF NOT EXISTS "enableCallCost" BOOLEAN NOT NULL DEFAULT FALSE;
  `)
}

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    ALTER TABLE "ActiveCall"
      DROP COLUMN IF EXISTS "cost",
      DROP COLUMN IF EXISTS "costCurrency";
  `)
  await context.sequelize.query(`
    ALTER TABLE "CommProviderConfig"
      DROP COLUMN IF EXISTS "enableCallCost";
  `)
}
