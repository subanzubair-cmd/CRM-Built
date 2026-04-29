import { CompanySettings } from '@crm/database'

/**
 * Server-side accessor for the singleton CompanySettings row.
 *
 * The row is cached in `globalThis` so every request doesn't re-query
 * Postgres for the same settings. Cache invalidation has two paths:
 *
 *   1) Explicit: `setCompanyTimezone` resets the cache on the writing
 *      process immediately so its next read sees the new value.
 *      `invalidateCompanySettingsCache` is exposed for tests.
 *
 *   2) TTL (60s): in a multi-process / multi-replica deploy, an
 *      explicit invalidation only resets the writing process — every
 *      other replica would otherwise keep its stale value forever
 *      until process restart. The TTL bounds that staleness.
 *
 * The schema enforces id='singleton' via a CHECK constraint, and the
 * migration seeds the row at install time, so this read should never
 * miss in normal operation. We still defensively fall back to the
 * defaults if it does.
 *
 * NOTE: the CompanySettings table also has a `rejectMode` column from
 * an earlier feature, but the soft/hard reject toggle was removed —
 * Reject now always terminates the parent call at the provider. The
 * column is left in place for now to avoid a destructive migration;
 * nothing reads or writes it.
 */

const DEFAULT_TZ = 'America/Chicago'
const KEY = '__crm_company_settings__'
const CACHE_TTL_MS = 60_000

interface CompanySettingsCache {
  timezone: string
  fetchedAt: number
}

const g = globalThis as any

export interface CompanySettingsValue {
  timezone: string
}

export async function getCompanySettings(): Promise<CompanySettingsValue> {
  const cached = g[KEY] as CompanySettingsCache | undefined
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { timezone: cached.timezone }
  }
  try {
    const row = (await CompanySettings.findByPk('singleton', { raw: true })) as any
    const fresh: CompanySettingsCache = {
      timezone: row?.timezone ?? DEFAULT_TZ,
      fetchedAt: Date.now(),
    }
    g[KEY] = fresh
    return { timezone: fresh.timezone }
  } catch (err) {
    console.warn('[company-settings] read failed, using defaults:', err)
    return { timezone: DEFAULT_TZ }
  }
}

export async function setCompanyTimezone(timezone: string): Promise<void> {
  await CompanySettings.upsert({ id: 'singleton', timezone } as any)
  // Invalidate cache so next read sees the new value.
  g[KEY] = undefined
}

/** Drop the cached value — used by tests + by the API route after writes. */
export function invalidateCompanySettingsCache(): void {
  g[KEY] = undefined
}
