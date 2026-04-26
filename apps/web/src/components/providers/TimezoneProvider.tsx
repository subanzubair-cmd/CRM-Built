'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { format as fmt, formatDistanceToNow as distFn } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

/**
 * TimezoneProvider — exposes the CRM-wide company timezone (IANA) +
 * helpers that every date-display call site uses.
 *
 * Why this exists: Sequelize stores all timestamps as UTC. The browser
 * default for `format()` and `formatDistanceToNow()` is the user's
 * machine locale — so an agent in Karachi sees a different time than
 * the same lead would show for an agent in Texas. The CRM operator
 * sets ONE timezone in Settings → General; every agent renders dates
 * through that zone regardless of where they're logged in from.
 *
 * Usage:
 *   const { format, formatRelative } = useTz()
 *   format(msg.createdAt, 'MMM d, h:mm a')
 *   formatRelative(msg.createdAt)  // "5 minutes ago" — relative
 *
 * The provider is mounted in (app)/layout with the value loaded
 * server-side so first paint already has the right zone.
 */

interface TzContext {
  timezone: string
  /** Format a date in the company timezone using a date-fns pattern. */
  format: (date: Date | string | number, pattern: string) => string
  /** "5 minutes ago" / "in 2 hours" — also resolved against the zone
   *  for consistency. */
  formatRelative: (date: Date | string | number, opts?: { addSuffix?: boolean }) => string
}

const TimezoneContext = createContext<TzContext | null>(null)

export function TimezoneProvider({ timezone, children }: { timezone: string; children: ReactNode }) {
  const value: TzContext = {
    timezone,
    format(d, pattern) {
      const date = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d
      const zoned = toZonedTime(date, timezone)
      return fmt(zoned, pattern)
    },
    formatRelative(d, opts) {
      const date = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d
      // formatDistanceToNow compares to NOW which is timezone-agnostic
      // (it's epoch math), so no zone conversion is needed here. The
      // helper is exposed via the same hook for consistency.
      return distFn(date, { addSuffix: opts?.addSuffix ?? true })
    },
  }
  return <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>
}

export function useTz(): TzContext {
  const ctx = useContext(TimezoneContext)
  if (!ctx) {
    // Fallback if a component is rendered outside the provider — use
    // browser local zone. Logged so we can find missing wraps.
    if (typeof window !== 'undefined') {
      console.warn('[useTz] no provider — falling back to browser timezone')
    }
    return {
      timezone: typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : 'UTC',
      format(d, pattern) {
        const date = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d
        return fmt(date, pattern)
      },
      formatRelative(d, opts) {
        const date = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d
        return distFn(date, { addSuffix: opts?.addSuffix ?? true })
      },
    }
  }
  return ctx
}
