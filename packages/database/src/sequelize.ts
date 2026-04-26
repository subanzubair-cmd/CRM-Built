/**
 * Sequelize singleton — coexists with Prisma during the phased migration.
 *
 * Connection strategy:
 *   - Same Postgres database as Prisma, separate connection pool.
 *   - Distinct `application_name` so DBAs can trace which ORM ran a query
 *     via `pg_stat_activity` during the cutover window.
 *   - No shared transactions across ORMs. Pick one per business operation.
 *
 * After Phase 10 this file becomes the only ORM in the codebase; Prisma's
 * singleton is removed.
 */
import 'reflect-metadata'
import { Sequelize } from 'sequelize-typescript'
import { literal } from 'sequelize'
import type { SequelizeOptions } from 'sequelize-typescript'
import { types as pgTypes } from 'pg'

// pg type OID 1114 = TIMESTAMP (without time zone). The default parser
// treats the naive value as the host's local time, which on US/Central
// machines causes every read to shift +5h vs the actual stored value
// (raw '2026-04-26 11:45:36' → local CDT → ISO '2026-04-26T16:45:36Z').
// Our schema stores TIMESTAMP for createdAt/updatedAt — so we override
// the parser to assume UTC, matching how the writer hook + Postgres
// NOW() actually populate them.
pgTypes.setTypeParser(1114, (raw: string) => new Date(`${raw}Z`))

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  // We tolerate missing URL at module load so build steps don't blow up;
  // the first call to `sequelize.authenticate()` will throw a clear error.
  console.warn('[sequelize] DATABASE_URL is not set — connections will fail at runtime')
}

const isProd = process.env.NODE_ENV === 'production'

const sequelizeOptions: SequelizeOptions = {
  dialect: 'postgres',
  // Quiet by default; flip to console.log when you need to see the SQL.
  logging: process.env.SEQUELIZE_LOG === '1' ? console.log : false,
  // Force Sequelize to send/receive timestamps as UTC strings. Without
  // this, Sequelize 6 + sequelize-typescript decorators can land on the
  // host's local timezone and double-shift (DataType.NOW evaluated as
  // a JS Date but serialized assuming a wrong source TZ produced rows
  // ~5h in the future on US/Central hosts).
  timezone: '+00:00',
  // Don't add Sequelize's automatic createdAt/updatedAt — every model declares
  // its own to match the existing Prisma-managed columns byte-for-byte.
  define: {
    timestamps: false,
    freezeTableName: true,
    // Universal beforeValidate hook: stamp createdAt/updatedAt with
    // Node's `new Date()` whenever the model has those columns. This
    // bypasses the broken @Default(DataType.NOW) evaluator and
    // guarantees the value is the actual current epoch.
    hooks: {
      // Stamp timestamps with Postgres `NOW()` on every create/update.
      //
      // Sequelize-typescript v2.1.6 + Sequelize v6.37 mishandle JS
      // Dates on US/Central hosts: passing `new Date()` (= correct
      // UTC ms internally) results in stored TIMESTAMPTZ values that
      // are 5h ahead of wall-clock. Root cause is a TZ double-
      // conversion somewhere in the prepared-statement path; we tried
      // `timezone: '+00:00'` already and it didn't help.
      //
      // Side-stepping the bug entirely by using `literal('NOW()')` —
      // Postgres evaluates that server-side using its own clock (which
      // we've confirmed is correct UTC), so the value can't be
      // mis-shifted on the way in.
      beforeCreate(instance: any) {
        try {
          if (instance != null && typeof instance.set === 'function') {
            const attrs = (instance.constructor as any)?.rawAttributes ?? {}
            if ('createdAt' in attrs) instance.set('createdAt', literal('NOW()'))
            if ('updatedAt' in attrs) instance.set('updatedAt', literal('NOW()'))
          }
        } catch {
          // Silent — never block a write.
        }
      },
      beforeUpdate(instance: any) {
        try {
          if (instance != null && typeof instance.set === 'function') {
            const attrs = (instance.constructor as any)?.rawAttributes ?? {}
            if ('updatedAt' in attrs) instance.set('updatedAt', literal('NOW()'))
          }
        } catch {
          // Silent.
        }
      },
    },
  },
  pool: {
    max: 10,
    min: 0,
    acquire: 30_000,
    idle: 10_000,
  },
  dialectOptions: {
    application_name: 'crm-sequelize',
    // Match the SSL behavior implied by the existing DATABASE_URL. If you need
    // SSL on a managed Postgres, set PGSSLMODE=require in env.
  },
  // Models get registered in the barrel `src/models/index.ts`. The list grows
  // phase-by-phase. During Phase 1 it is empty.
  models: [],
}

// Avoid creating multiple instances during dev hot-reload.
const globalForSequelize = globalThis as unknown as { sequelize?: Sequelize }

export const sequelize: Sequelize =
  globalForSequelize.sequelize ?? new Sequelize(databaseUrl ?? '', sequelizeOptions)

// Belt-and-suspenders: also register the timestamp hook directly on
// the Sequelize instance. Sequelize-typescript adds models later via
// addModels(), and define.hooks doesn't always propagate to those —
// adding here too guarantees the hook fires for every model.
sequelize.addHook('beforeCreate', (instance: any) => {
  try {
    if (instance != null && typeof instance.set === 'function') {
      const attrs = (instance.constructor as any)?.rawAttributes ?? {}
      if ('createdAt' in attrs) instance.set('createdAt', literal('NOW()'))
      if ('updatedAt' in attrs) instance.set('updatedAt', literal('NOW()'))
    }
  } catch {
    // Silent.
  }
})
sequelize.addHook('beforeUpdate', (instance: any) => {
  try {
    if (instance != null && typeof instance.set === 'function') {
      const attrs = (instance.constructor as any)?.rawAttributes ?? {}
      if ('updatedAt' in attrs) instance.set('updatedAt', literal('NOW()'))
    }
  } catch {
    // Silent.
  }
})

if (process.env.NODE_ENV !== 'production') {
  globalForSequelize.sequelize = sequelize
}

/**
 * Register a model class with the running singleton. Called from
 * `models/index.ts` once per migrated model so we can append models without
 * recreating the Sequelize instance.
 */
export function registerSequelizeModel(model: any): void {
  sequelize.addModels([model])
}

/**
 * Health check — used by tests and the boot smoke check to confirm
 * connectivity without running any models.
 */
export async function pingDatabase(): Promise<void> {
  await sequelize.authenticate()
}
