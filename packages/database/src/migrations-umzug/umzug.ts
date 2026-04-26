/**
 * Umzug runner — owns DDL after Phase 1 lands.
 *
 * History table: `SequelizeMeta` (separate from Prisma's `_prisma_migrations`).
 *
 * Bootstrap behavior:
 *   When this runner first starts on a database that already has the schema
 *   (i.e. Prisma's two migrations already ran), we pre-seed `SequelizeMeta`
 *   with the names of the equivalent Umzug migrations so they're skipped on
 *   first `up`. Without this, Umzug would try to re-apply the init schema
 *   and explode with "table already exists" errors.
 *
 * On a fresh database (no Prisma history), no pre-seeding happens — Umzug
 * runs the migrations normally to build the schema from scratch.
 */
import { Umzug, SequelizeStorage } from 'umzug'
import { sequelize } from '../sequelize'
import { up as initUp, down as initDown } from './20260409101039-init-full-schema'
import {
  up as indexUp,
  down as indexDown,
} from './20260409101049-normalized-address-partial-index'
import {
  up as deadReasonsUp,
  down as deadReasonsDown,
} from './20260425200000-add-dead-reasons'
import {
  up as callCostUp,
  down as callCostDown,
} from './20260426010000-add-call-cost'
import {
  up as callRecordingUp,
  down as callRecordingDown,
} from './20260426020000-add-call-recording'
import {
  up as recordingStorageKeyUp,
  down as recordingStorageKeyDown,
} from './20260426030000-add-call-recording-storage-key'
import {
  up as companySettingsUp,
  down as companySettingsDown,
} from './20260426040000-add-company-settings'
import {
  up as rejectModeUp,
  down as rejectModeDown,
} from './20260426050000-add-reject-mode'

// List Umzug migrations explicitly. When a new migration is added, append
// its module here. We deliberately do NOT use a glob — explicit is safer
// during a multi-week phased migration where files churn.
const migrations = [
  {
    name: '20260409101039-init-full-schema',
    up: ({ context }: { context: any }) =>
      initUp({ name: '20260409101039-init-full-schema', context }),
    down: ({ context }: { context: any }) =>
      initDown({ name: '20260409101039-init-full-schema', context }),
  },
  {
    name: '20260409101049-normalized-address-partial-index',
    up: ({ context }: { context: any }) =>
      indexUp({ name: '20260409101049-normalized-address-partial-index', context }),
    down: ({ context }: { context: any }) =>
      indexDown({ name: '20260409101049-normalized-address-partial-index', context }),
  },
  {
    name: '20260425200000-add-dead-reasons',
    up: ({ context }: { context: any }) =>
      deadReasonsUp({ name: '20260425200000-add-dead-reasons', context }),
    down: ({ context }: { context: any }) =>
      deadReasonsDown({ name: '20260425200000-add-dead-reasons', context }),
  },
  {
    name: '20260426010000-add-call-cost',
    up: ({ context }: { context: any }) =>
      callCostUp({ name: '20260426010000-add-call-cost', context }),
    down: ({ context }: { context: any }) =>
      callCostDown({ name: '20260426010000-add-call-cost', context }),
  },
  {
    name: '20260426020000-add-call-recording',
    up: ({ context }: { context: any }) =>
      callRecordingUp({ name: '20260426020000-add-call-recording', context }),
    down: ({ context }: { context: any }) =>
      callRecordingDown({ name: '20260426020000-add-call-recording', context }),
  },
  {
    name: '20260426030000-add-call-recording-storage-key',
    up: ({ context }: { context: any }) =>
      recordingStorageKeyUp({ name: '20260426030000-add-call-recording-storage-key', context }),
    down: ({ context }: { context: any }) =>
      recordingStorageKeyDown({ name: '20260426030000-add-call-recording-storage-key', context }),
  },
  {
    name: '20260426040000-add-company-settings',
    up: ({ context }: { context: any }) =>
      companySettingsUp({ name: '20260426040000-add-company-settings', context }),
    down: ({ context }: { context: any }) =>
      companySettingsDown({ name: '20260426040000-add-company-settings', context }),
  },
  {
    name: '20260426050000-add-reject-mode',
    up: ({ context }: { context: any }) =>
      rejectModeUp({ name: '20260426050000-add-reject-mode', context }),
    down: ({ context }: { context: any }) =>
      rejectModeDown({ name: '20260426050000-add-reject-mode', context }),
  },
]

export const umzug = new Umzug({
  migrations,
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize, tableName: 'SequelizeMeta' }),
  logger: console,
})

/**
 * If the DB has Prisma migrations applied but no SequelizeMeta rows, seed
 * SequelizeMeta with the equivalent Umzug migration names so they're
 * skipped. Idempotent and safe to run on fresh DBs (it only inserts when
 * Prisma's table is present AND has the matching rows).
 */
export async function bootstrapFromPrismaHistory(): Promise<void> {
  const qi = sequelize.getQueryInterface()

  // Does Prisma's history table exist?
  const [prismaTableRows] = (await sequelize.query(`
    SELECT to_regclass('public._prisma_migrations') AS rel
  `)) as any[]
  const prismaExists = !!prismaTableRows?.[0]?.rel

  if (!prismaExists) {
    return // fresh DB — Umzug should run all migrations normally
  }

  // Does Prisma's table contain the two known migrations as applied?
  const [appliedRows] = (await sequelize.query(`
    SELECT migration_name FROM _prisma_migrations
    WHERE migration_name IN (
      '20260409101039_init_full_schema',
      '20260409101049_normalized_address_partial_index'
    )
    AND finished_at IS NOT NULL
  `)) as any[]
  const appliedNames = new Set((appliedRows ?? []).map((r: any) => r.migration_name))

  if (appliedNames.size === 0) {
    return
  }

  // Make sure SequelizeMeta exists (Umzug normally creates it on first run).
  await qi.createTable('SequelizeMeta', {
    name: { type: 'VARCHAR(255)' as any, primaryKey: true, allowNull: false },
  }).catch(() => {
    /* already exists */
  })

  const seed: Array<[string, string]> = [
    ['20260409101039_init_full_schema', '20260409101039-init-full-schema'],
    [
      '20260409101049_normalized_address_partial_index',
      '20260409101049-normalized-address-partial-index',
    ],
  ]

  for (const [prismaName, umzugName] of seed) {
    if (!appliedNames.has(prismaName)) continue
    await sequelize.query(
      `INSERT INTO "SequelizeMeta" ("name") VALUES (:name)
       ON CONFLICT ("name") DO NOTHING`,
      { replacements: { name: umzugName } },
    )
  }
}

/**
 * Convenience wrapper — bootstrap from Prisma history (no-op on fresh DB),
 * then run any pending Umzug migrations.
 */
export async function migrateUp(): Promise<void> {
  await bootstrapFromPrismaHistory()
  await umzug.up()
}

export async function migrateDownLast(): Promise<void> {
  await umzug.down()
}

export async function migrateStatus(): Promise<{
  applied: string[]
  pending: string[]
}> {
  const applied = (await umzug.executed()).map((m) => m.name)
  const pending = (await umzug.pending()).map((m) => m.name)
  return { applied, pending }
}
