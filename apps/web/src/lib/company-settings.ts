import { CompanySettings } from '@crm/database'

/**
 * Server-side accessor for the singleton CompanySettings row.
 *
 * Result is cached in `globalThis` for the lifetime of the Node
 * process so every request doesn't re-query Postgres for the same
 * settings. The cache is invalidated by `setCompanySettings()`.
 *
 * The schema enforces id='singleton' via a CHECK constraint, and the
 * migration seeds the row at install time, so this read should never
 * miss in normal operation. We still defensively fall back to the
 * default timezone if it does.
 */

const DEFAULT_TZ = 'America/Chicago'
const KEY = '__crm_company_settings__'

interface CompanySettingsCache {
  timezone: string
  fetchedAt: number
}

const g = globalThis as any

export async function getCompanySettings(): Promise<{ timezone: string }> {
  if (g[KEY]) return { timezone: g[KEY].timezone }
  try {
    const row = await CompanySettings.findByPk('singleton', { raw: true }) as any
    const cache: CompanySettingsCache = {
      timezone: row?.timezone ?? DEFAULT_TZ,
      fetchedAt: Date.now(),
    }
    g[KEY] = cache
    return { timezone: cache.timezone }
  } catch (err) {
    console.warn('[company-settings] read failed, using default:', err)
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
