/**
 * Centralized association wiring for Sequelize models.
 *
 * Exposed as a function rather than running at import time because ESM
 * imports hoist — if this file's top-level code ran, `Model.hasMany`
 * would fire BEFORE `sequelize.addModels(...)` initializes the registry.
 * `models/index.ts` calls `wireAssociations()` AFTER `addModels`.
 *
 * As clusters migrate, append a small block per cluster.
 */
import { GlobalFile } from './GlobalFile'
import { GlobalFolder } from './GlobalFolder'

export function wireAssociations(): void {
  // ── Phase 2: Independent leaves ───────────────────────────────────────────
  //
  // GlobalFile.folderId → GlobalFolder.id (onDelete: SetNull at the DB
  // level). We don't add `onDelete: 'SET NULL'` here — the existing
  // Postgres FK constraint enforces it.
  GlobalFolder.hasMany(GlobalFile, { foreignKey: 'folderId', as: 'files' })
  GlobalFile.belongsTo(GlobalFolder, { foreignKey: 'folderId', as: 'folder' })
}
