/**
 * Shared cuid generator for Sequelize models.
 *
 * Prisma's `@default(cuid())` generates the original cuid (v1) format
 * (`c...` prefix). To match the existing data in production, our Sequelize
 * models use the same `cuid` package for new rows.
 *
 * Don't use cuid2 here — it produces different lengths/character sets that
 * would mix awkwardly with existing rows.
 */
import cuid from 'cuid'

export const newCuid = (): string => cuid()
