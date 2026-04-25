/**
 * Sequelize model registry — barrel file.
 *
 * As clusters migrate, each model class is exported from a sibling file
 * and re-exported here. The Sequelize singleton picks them up via
 * `addModels()` in the bootstrapper below. Then `_associations.ts`
 * (loaded LAST) wires cross-model relations to avoid circular imports.
 */
import { sequelize } from '../sequelize'

// ── Phase 2: Independent leaf models ────────────────────────────────────────
import { LeadSource } from './LeadSource'
import { TwilioNumber } from './TwilioNumber'
import { Tag } from './Tag'
import { Market } from './Market'
import { AiConfiguration } from './AiConfiguration'
import { GlobalFolder } from './GlobalFolder'
import { GlobalFile } from './GlobalFile'
import { ListStackSource } from './ListStackSource'
import { CommProviderConfig } from './CommProviderConfig'

// Register all migrated model classes with the Sequelize instance.
// Order matters when using sequelize-typescript decorators that reference
// other classes — children before parents. Phase 2 leaves are independent
// (only GlobalFile → GlobalFolder, registered in that order below).
sequelize.addModels([
  LeadSource,
  TwilioNumber,
  Tag,
  Market,
  AiConfiguration,
  GlobalFolder, // before GlobalFile (FK target)
  GlobalFile,
  ListStackSource,
  CommProviderConfig,
])

// Wire cross-model associations AFTER addModels (the registry must be
// populated first). Importing this module is a side effect.
import { wireAssociations } from './_associations'
wireAssociations()

// ── Public re-exports ───────────────────────────────────────────────────────
export {
  LeadSource,
  TwilioNumber,
  Tag,
  Market,
  AiConfiguration,
  GlobalFolder,
  GlobalFile,
  ListStackSource,
  CommProviderConfig,
}
