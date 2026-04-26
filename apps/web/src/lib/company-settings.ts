import { CompanySettings } from '@crm/database'

/**
 * Server-side accessor for the singleton CompanySettings row.
 *
 * Result is cached in `globalThis` for the lifetime of the Node
 * process so every request doesn't re-query Postgres for the same
 * settings. The cache is invalidated by `setCompanyTimezone()` /
 * `setRejectMode()`.
 *
 * The schema enforces id='singleton' via a CHECK constraint, and the
 * migration seeds the row at install time, so this read should never
 * miss in normal operation. We still defensively fall back to the
 * defaults if it does.
 */

const DEFAULT_TZ = 'America/Chicago'
const DEFAULT_REJECT_MODE: 'soft' | 'hard' = 'soft'
const KEY = '__crm_company_settings__'

interface CompanySettingsCache {
  timezone: string
  rejectMode: 'soft' | 'hard'
  fetchedAt: number
}

const g = globalThis as any

export interface CompanySettingsValue {
  timezone: string
  rejectMode: 'soft' | 'hard'
}

export async function getCompanySettings(): Promise<CompanySettingsValue> {
  if (g[KEY]) {
    return { timezone: g[KEY].timezone, rejectMode: g[KEY].rejectMode }
  }
  try {
    const row = (await CompanySettings.findByPk('singleton', { raw: true })) as any
    const cache: CompanySettingsCache = {
      timezone: row?.timezone ?? DEFAULT_TZ,
      rejectMode: row?.rejectMode === 'hard' ? 'hard' : DEFAULT_REJECT_MODE,
      fetchedAt: Date.now(),
    }
    g[KEY] = cache
    return { timezone: cache.timezone, rejectMode: cache.rejectMode }
  } catch (err) {
    console.warn('[company-settings] read failed, using defaults:', err)
    return { timezone: DEFAULT_TZ, rejectMode: DEFAULT_REJECT_MODE }
  }
}

export async function setCompanyTimezone(timezone: string): Promise<void> {
  await CompanySettings.upsert({ id: 'singleton', timezone } as any)
  // Invalidate cache so next read sees the new value.
  g[KEY] = undefined
}

export async function setRejectMode(rejectMode: 'soft' | 'hard'): Promise<void> {
  await CompanySettings.upsert({ id: 'singleton', rejectMode } as any)
  g[KEY] = undefined
}

/** Drop the cached value — used by tests + by the API route after writes. */
export function invalidateCompanySettingsCache(): void {
  g[KEY] = undefined
}
