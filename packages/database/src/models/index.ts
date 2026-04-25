/**
 * Sequelize model registry — barrel file.
 *
 * As clusters migrate (Phase 2 onward), each model class is exported from a
 * sibling file (e.g. `./LeadSource.ts`) and re-exported here. The
 * `registerSequelizeModel` helper attaches it to the Sequelize singleton.
 *
 * After every model in a phase is added, `_associations.ts` (loaded LAST)
 * wires the cross-model `@HasMany` / `@BelongsTo` so circular imports stay
 * tame.
 *
 * Phase 1: empty registry — Sequelize boots with zero models so we can
 * verify infrastructure works end-to-end before any class lands here.
 */

// Per-phase model exports go here:
// export { LeadSource } from './LeadSource'    // Phase 2
// export { TwilioNumber } from './TwilioNumber' // Phase 2
// ...

// Always last — wires associations between exported models.
import './_associations'

export {}
