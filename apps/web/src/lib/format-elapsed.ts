/**
 * Returns a compact elapsed-time string from a date to now.
 * Examples: "just now", "45m", "3h", "2d", "1w", "3mo"
 */
export function formatElapsed(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w`
  const months = Math.floor(days / 30)
  return `${months}mo`
}

/**
 * Returns Tailwind text color class based on elapsed time urgency.
 * green = active (<1d), amber = stale (1–7d), red = overdue (>7d)
 */
export function activityColorClass(date: Date | string | null | undefined): string {
  if (!date) return 'text-gray-400'
  const hours = (Date.now() - new Date(date).getTime()) / 3_600_000
  if (hours < 24) return 'text-green-600'
  if (hours < 168) return 'text-amber-500'
  return 'text-red-500'
}
