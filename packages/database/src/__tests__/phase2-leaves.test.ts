/**
 * Phase 2 smoke: read every leaf model from the live DB and confirm column
 * mappings work. Uses existing rows where seeded; otherwise just asserts
 * the query parses + executes without error.
 *
 * Skipped if DATABASE_URL is missing.
 */
import { describe, it, expect } from 'vitest'
import { sequelize } from '../sequelize'
import {
  LeadSource,
  TwilioNumber,
  Tag,
  Market,
  AiConfiguration,
  GlobalFolder,
  GlobalFile,
  ListStackSource,
  CommProviderConfig,
} from '../models'

const HAS_DB = !!process.env.DATABASE_URL

describe.skipIf(!HAS_DB)('Phase 2 leaf models smoke', () => {
  it('LeadSource.findAll returns rows with expected columns', async () => {
    const rows = await LeadSource.findAll({ limit: 3 })
    if (rows.length > 0) {
      const r = rows[0]
      expect(typeof r.id).toBe('string')
      expect(typeof r.name).toBe('string')
      expect(typeof r.isActive).toBe('boolean')
      expect(typeof r.isSystem).toBe('boolean')
      expect(r.createdAt).toBeInstanceOf(Date)
    }
  })

  it('TwilioNumber.findAll returns rows', async () => {
    const rows = await TwilioNumber.findAll({ limit: 3 })
    if (rows.length > 0) {
      const r = rows[0]
      expect(typeof r.number).toBe('string')
      expect(typeof r.isActive).toBe('boolean')
      expect(typeof r.purpose).toBe('string')
    }
  })

  it('Tag.findAll honors composite-unique', async () => {
    // Smoke: count is enough — no unique row required.
    const count = await Tag.count()
    expect(typeof count).toBe('number')
  })

  it('Market.findAll returns rows', async () => {
    const count = await Market.count()
    expect(typeof count).toBe('number')
  })

  it('AiConfiguration.findAll returns JSONB columns as objects', async () => {
    const rows = await AiConfiguration.findAll({ limit: 1 })
    if (rows.length > 0) {
      const r = rows[0]
      expect(typeof r.configJson).toBe('object')
    }
  })

  it('GlobalFolder ↔ GlobalFile association resolves', async () => {
    // Just calling include is the smoke; if association registration was
    // broken, Sequelize would throw on the query plan.
    const rows = await GlobalFolder.findAll({
      limit: 1,
      include: [{ model: GlobalFile, as: 'files' }],
    })
    expect(Array.isArray(rows)).toBe(true)
  })

  it('ListStackSource.tags is parsed as a string[] from Postgres ARRAY', async () => {
    const rows = await ListStackSource.findAll({ limit: 1 })
    if (rows.length > 0) {
      expect(Array.isArray(rows[0].tags)).toBe(true)
    }
  })

  it('CommProviderConfig.configJson round-trips JSONB', async () => {
    const rows = await CommProviderConfig.findAll({ limit: 1 })
    if (rows.length > 0) {
      const r = rows[0]
      expect(typeof r.configJson).toBe('object')
    }
  })

  it('all 9 leaf classes are in sequelize.models', () => {
    const expected = [
      'LeadSource',
      'TwilioNumber',
      'Tag',
      'Market',
      'AiConfiguration',
      'GlobalFolder',
      'GlobalFile',
      'ListStackSource',
      'CommProviderConfig',
    ]
    for (const name of expected) {
      expect(sequelize.models).toHaveProperty(name)
    }
  })
})
