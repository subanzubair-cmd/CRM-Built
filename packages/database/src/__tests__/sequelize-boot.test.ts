/**
 * Phase 1 boot smoke test for the Sequelize singleton.
 *
 * Asserts:
 *   1. The instance constructs without throwing.
 *   2. It can authenticate against the running Postgres database.
 *   3. The migration runner can read its `SequelizeMeta` history.
 *   4. Either zero models are registered (Phase 1 baseline) or every
 *      registered model resolves to a non-null target — no half-wired
 *      associations slip into production.
 *
 * As more clusters migrate, the assertion at #4 becomes the canary that
 * catches load-order bugs.
 *
 * Skipped automatically if DATABASE_URL is missing (CI in environments
 * without a DB will mark this as a no-op rather than a failure).
 */
import 'reflect-metadata'
import { describe, it, expect } from 'vitest'
import { sequelize, pingDatabase } from '../sequelize'
import { migrateStatus } from '../migrations-umzug/umzug'
import '../models' // ensure registry side-effects fire

const HAS_DB = !!process.env.DATABASE_URL

describe.skipIf(!HAS_DB)('Sequelize boot smoke', () => {
  it('constructs the singleton', () => {
    expect(sequelize).toBeDefined()
    expect(sequelize.getDialect()).toBe('postgres')
  })

  it('authenticates against the database', async () => {
    await expect(pingDatabase()).resolves.not.toThrow()
  })

  it('reports migration status without crashing', async () => {
    const status = await migrateStatus()
    expect(status).toHaveProperty('applied')
    expect(status).toHaveProperty('pending')
    // Either Prisma history bootstrapped two rows or the DB is fresh and
    // both are pending — both are valid.
    expect(status.applied.length + status.pending.length).toBe(2)
  })

  it('all registered models resolve their associations to non-null targets', () => {
    const models = sequelize.models
    const modelNames = Object.keys(models)
    // Phase 1: empty registry. As clusters land, this list grows; the loop
    // below is the actual canary.
    for (const name of modelNames) {
      const associations = (models[name] as any).associations ?? {}
      for (const [assocName, assoc] of Object.entries<any>(associations)) {
        expect(assoc.target, `${name}.${assocName} target is undefined`).toBeDefined()
      }
    }
  })
})
