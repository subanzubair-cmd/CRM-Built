/**
 * Add hot-path indexes to `ActiveCall` and `Message`.
 *
 * Both tables previously relied on the PK only (plus a couple of
 * uniques on `ActiveCall`), which meant every status sweep, inbox
 * thread fetch, and FK join was a sequential scan. As call/message
 * volume grows this becomes the dominant cost on the most-read
 * paths in the app.
 *
 * `ActiveCall` indexes:
 *   - (status, createdAt DESC)  — covers the GET /api/calls sweep
 *     (status=X AND createdAt < cutoff, repeated 3x) plus the
 *     primary findAll (status IN (...) AND createdAt >= cutoff).
 *   - (agentUserId), (propertyId), (leadCampaignId) — FK columns
 *     that participate in joins/filters but had no btree.
 *
 * `Message` indexes:
 *   - (conversationId, createdAt DESC) — Inbox thread display, the
 *     hottest read path on this table.
 *   - (propertyId, createdAt DESC) — per-lead activity feed.
 *   - (twilioSid) WHERE twilioSid IS NOT NULL — webhook retry
 *     dedup; partial because most rows (calls/notes/system) are
 *     null and we don't want them in the index.
 *   - (contactId), (leadCampaignId) — FK columns used in
 *     contact-centric and campaign-centric views.
 *
 * All `CREATE INDEX IF NOT EXISTS` so re-running is safe; `down`
 * mirrors with `DROP INDEX IF EXISTS`.
 */
import type { MigrationFn } from 'umzug'
import type { QueryInterface } from 'sequelize'

const ACTIVE_CALL_INDEXES = [
  {
    name: 'idx_active_call_status_created_at',
    sql: `CREATE INDEX IF NOT EXISTS "idx_active_call_status_created_at"
          ON "ActiveCall" ("status", "createdAt" DESC);`,
  },
  {
    name: 'idx_active_call_agent_user_id',
    sql: `CREATE INDEX IF NOT EXISTS "idx_active_call_agent_user_id"
          ON "ActiveCall" ("agentUserId");`,
  },
  {
    name: 'idx_active_call_property_id',
    sql: `CREATE INDEX IF NOT EXISTS "idx_active_call_property_id"
          ON "ActiveCall" ("propertyId");`,
  },
  {
    name: 'idx_active_call_lead_campaign_id',
    sql: `CREATE INDEX IF NOT EXISTS "idx_active_call_lead_campaign_id"
          ON "ActiveCall" ("leadCampaignId");`,
  },
]

const MESSAGE_INDEXES = [
  {
    name: 'idx_message_conversation_id_created_at',
    sql: `CREATE INDEX IF NOT EXISTS "idx_message_conversation_id_created_at"
          ON "Message" ("conversationId", "createdAt" DESC);`,
  },
  {
    name: 'idx_message_property_id_created_at',
    sql: `CREATE INDEX IF NOT EXISTS "idx_message_property_id_created_at"
          ON "Message" ("propertyId", "createdAt" DESC);`,
  },
  {
    name: 'idx_message_twilio_sid',
    sql: `CREATE INDEX IF NOT EXISTS "idx_message_twilio_sid"
          ON "Message" ("twilioSid")
          WHERE "twilioSid" IS NOT NULL;`,
  },
  {
    name: 'idx_message_contact_id',
    sql: `CREATE INDEX IF NOT EXISTS "idx_message_contact_id"
          ON "Message" ("contactId");`,
  },
  {
    name: 'idx_message_lead_campaign_id',
    sql: `CREATE INDEX IF NOT EXISTS "idx_message_lead_campaign_id"
          ON "Message" ("leadCampaignId");`,
  },
]

const ALL_INDEXES = [...ACTIVE_CALL_INDEXES, ...MESSAGE_INDEXES]

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  for (const { sql } of ALL_INDEXES) {
    await context.sequelize.query(sql)
  }
}

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  for (const { name } of ALL_INDEXES) {
    await context.sequelize.query(`DROP INDEX IF EXISTS "${name}";`)
  }
}
