/**
 * Schedule helpers for the drip executor.
 *
 * - `addDelay(now, amount, unit)` — apply a (number, unit) delay to a
 *   timestamp. Months use add-month semantics (no day-of-month
 *   overflow shenanigans — we clamp to the last day of the target
 *   month if needed, matching how date-fns does it).
 *
 * - `pushPastWeekendsAndHolidays(at)` — if `at` lands on Sat / Sun
 *   or a US public holiday, push it to 09:00 local on the next
 *   business day. The spec's tooltip describes this exact
 *   behavior. We carry a small built-in holiday list so we don't
 *   need an extra dependency for v1; expand it in a config table
 *   later if a customer asks for non-US holidays.
 */

import type { CampaignDelayUnit } from '@crm/database'

const MS = {
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
}

export function addDelay(now: Date, amount: number, unit: CampaignDelayUnit): Date {
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
      // If the target month is shorter than the source's day-of-month
      // (e.g. Jan 31 + 1 → Mar 3), JS rolls over. Clamp to the last
      // day of the intended month so a "+1 month" operation always
      // moves to roughly one month later, never the next-next month.
      if (out.getMonth() !== ((targetMonth % 12) + 12) % 12) {
        out.setDate(0)
      }
      return out
    }
  }
}

/**
 * Fixed US federal holiday set (year-agnostic — we use month/day or
 * an "Nth weekday of month" rule). Intentionally minimal; the
 * commerce side cares about whether to skip a send, not precise
 * compliance with every regional holiday.
 */
function isUsHoliday(date: Date): boolean {
  const m = date.getMonth() + 1 // 1..12
  const d = date.getDate()
  const dow = date.getDay() // 0=Sun, 6=Sat

  // Fixed-date federal holidays (observed dates approximate — we don't
  // bump to Friday / Monday for weekend-falling holidays because
  // this function is also called for Sat/Sun directly and the caller
  // already pushes those forward).
  if (m === 1 && d === 1) return true // New Year's
  if (m === 7 && d === 4) return true // Independence Day
  if (m === 11 && d === 11) return true // Veterans Day
  if (m === 12 && d === 25) return true // Christmas

  // "Nth weekday of month" holidays.
  const nthWeekdayOfMonth = (n: number, weekday: number) => {
    if (dow !== weekday) return false
    return Math.ceil(d / 7) === n
  }

  if (m === 1 && nthWeekdayOfMonth(3, 1)) return true // MLK — 3rd Monday Jan
  if (m === 2 && nthWeekdayOfMonth(3, 1)) return true // Presidents' Day — 3rd Mon Feb
  if (m === 9 && nthWeekdayOfMonth(1, 1)) return true // Labor Day — 1st Mon Sept
  if (m === 10 && nthWeekdayOfMonth(2, 1)) return true // Columbus / Indigenous — 2nd Mon Oct
  if (m === 11 && nthWeekdayOfMonth(4, 4)) return true // Thanksgiving — 4th Thu Nov

  // Memorial Day — last Monday in May.
  if (m === 5 && dow === 1) {
    const next = new Date(date)
    next.setDate(d + 7)
    if (next.getMonth() + 1 !== 5) return true
  }

  return false
}

export function pushPastWeekendsAndHolidays(at: Date): Date {
  const out = new Date(at)
  // Walk forward by one day at a time until we hit a business day.
  // Bounded to 14 iterations so a buggy holiday rule can't loop.
  for (let i = 0; i < 14; i++) {
    const dow = out.getDay()
    const isWeekend = dow === 0 || dow === 6
    if (!isWeekend && !isUsHoliday(out)) {
      // Move time of day to 09:00 local so a paused-overnight step
      // doesn't immediately fire at 00:00 on Monday.
      if (out.getHours() < 9) out.setHours(9, 0, 0, 0)
      return out
    }
    out.setDate(out.getDate() + 1)
    out.setHours(9, 0, 0, 0)
  }
  return out
}

/**
 * Convenience: compute when a step's `fireAt` should be, given the
 * anchor time (enrollment.firstStepAt for step 0, prior step's
 * actual fire time for later steps), the step's delay, and the
 * step's skipWeekendsAndHolidays flag.
 */
export function computeFireAt(
  anchor: Date,
  step: { delayAmount: number; delayUnit: CampaignDelayUnit; skipWeekendsAndHolidays: boolean },
): Date {
  const raw = addDelay(anchor, step.delayAmount, step.delayUnit)
  return step.skipWeekendsAndHolidays ? pushPastWeekendsAndHolidays(raw) : raw
}
