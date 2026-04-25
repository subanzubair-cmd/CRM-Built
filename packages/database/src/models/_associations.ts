/**
 * Centralized association wiring for Sequelize models.
 *
 * Why a separate file?
 *   `sequelize-typescript` decorators like `@HasMany(() => OtherModel)`
 *   evaluate lazily, but during model registration Sequelize needs both
 *   sides resolved. Putting all `Model.hasMany` / `Model.belongsTo` calls
 *   in one place — imported LAST — eliminates load-order bugs.
 *
 * Phase 1: empty (no models yet).
 * Phase 2 onward: each cluster appends a small block here that wires its
 * relations to already-migrated models. When all 71 relations are wired,
 * the boot test in `__tests__/sequelize-boot.test.ts` asserts none are
 * `undefined`.
 */

// Example shape (added in Phase 2):
//
//   import { LeadSource } from './LeadSource'
//   import { LeadCampaign } from './LeadCampaign'
//   LeadSource.hasMany(LeadCampaign, { foreignKey: 'leadSourceId' })
//   LeadCampaign.belongsTo(LeadSource, { foreignKey: 'leadSourceId' })

export {}
