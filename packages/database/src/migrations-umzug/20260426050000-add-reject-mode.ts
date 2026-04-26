/**
 * Add `rejectMode` column to the singleton CompanySettings row.
 *
 *   'soft' (default) — Reject simply dismisses the popup in the CRM;
 *                      the caller's phone keeps ringing for the full
 *                      provider timeout (~30s for Telnyx). Useful for
 *                      teams that want a "snooze" semantic where the
 *                      caller can still leave a voicemail or get
 *                      forwarded to a backup line.
 *
 *   'hard'           — Reject also fires a hangup at the provider so
 *                      the caller's device disconnects immediately
 *                      ("you've been declined") just like a normal
 *                      mobile-phone reject.
 *
 * The /api/calls/[id]/reject route reads this on every reject and
 * branches accordingly. Toggle lives in Settings → Call Flow.
 */
import type { MigrationFn } from 'umzug'
import type { QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    ALTER TABLE "CompanySettings"
      ADD COLUMN IF NOT EXISTS "rejectMode" TEXT NOT NULL DEFAULT 'soft'
      CHECK ("rejectMode" IN ('soft', 'hard'));
  `)
}

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.sequelize.query(`
    ALTER TABLE "CompanySettings" DROP COLUMN IF EXISTS "rejectMode";
  `)
}
