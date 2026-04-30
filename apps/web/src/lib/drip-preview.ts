/**
 * Client-side mirror of `apps/api/src/lib/drip-schedule.addDelay` so
 * the activation modal can show "Based on your settings, the 1st
 * step will complete on …" preview without an extra round-trip.
 *
 * Keep these in sync — if the executor's semantics for MONTHS
 * change, update both. There's no shared package the API + web both
 * already depend on, and shipping a 30-line helper twice is cheaper
 * than wiring up a new package boundary just for this.
 */

export type DelayUnit = 'MINUTES' | 'HOURS' | 'DAYS' | 'WEEKS' | 'MONTHS'

const MS = {
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
}

export function addDelay(now: Date, amount: number, unit: DelayUnit): Date {
  if (!Number.isFinite(amount) || amount < 0) return new Date(now)
  switch (unit) {
    case 'MINUTES':
      return new Date(now.getTime() + amount * MS.minute)
    case 'HOURS':
      return new Date(now.getTime() + amount * MS.hour)
    case 'DAYS':
      return new Date(now.getTime() + amount * MS.day)
    case 'WEEKS':
      return new Date(now.getTime() + amount * MS.week)
    case 'MONTHS': {
      const out = new Date(now.getTime())
      const targetMonth = out.getMonth() + amount
      out.setMonth(targetMonth)
      if (out.getMonth() !== ((targetMonth % 12) + 12) % 12) {
        // Source was a day-of-month that doesn't exist in target
        // month (e.g. Jan 31 + 1m); clamp to the last day of the
        // intended month.
        out.setDate(0)
      }
      return out
    }
  }
}

/** Pretty-print "April 28th 2026, 9:19 PM" matching the spec's preview. */
export function formatPreviewTimestamp(date: Date): string {
  const month = date.toLocaleString('en-US', { month: 'long' })
  const day = date.getDate()
  const ordinal = ordinalSuffix(day)
  const year = date.getFullYear()
  let hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12 || 12
  return `${month} ${day}${ordinal} ${year}, ${hours}:${minutes} ${ampm}`
}

function ordinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] ?? s[v] ?? s[0]
}
