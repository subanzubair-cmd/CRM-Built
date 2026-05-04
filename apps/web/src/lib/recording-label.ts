/**
 * recording-label.ts — pure utilities for formatting call-recording metadata
 * into a human-friendly label and a download filename.
 *
 * Used by the recording API route (server) and the CallRecordingPlayer
 * (client). Keep this file isomorphic — no Node-only imports.
 *
 * Graceful degradation: any input field can be null/undefined. Missing parts
 * are silently dropped. The download builder always returns a usable filename
 * (worst case: "Call Recording.webm"). The display builder returns null when
 * nothing useful is available, so the UI can hide the header line entirely.
 */

export interface RecordingLabelInput {
  propertyAddress?: string | null
  durationSec?: number | null
  startedAt?: Date | string | null
  agentName?: string | null
}

/** "30s" / "1m" / "27m 30s" / "1h 5m 15s". null when duration is unknown. */
export function formatDurationLabel(sec: number | null | undefined): string | null {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null
  const total = Math.round(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const parts: string[] = []
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  if (s > 0 || (h === 0 && m === 0)) parts.push(`${s}s`)
  return parts.join(' ')
}

/** "MM-DD-YYYY" — filename-safe (no slashes). null on bad input. */
export function formatDateForFilename(d: Date | string | null | undefined): string | null {
  if (!d) return null
  const date = typeof d === 'string' ? new Date(d) : d
  if (!Number.isFinite(date.getTime())) return null
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${mm}-${dd}-${yyyy}`
}

/** "MM/DD/YYYY" — for on-screen display. null on bad input. */
export function formatDateForDisplay(d: Date | string | null | undefined): string | null {
  if (!d) return null
  const date = typeof d === 'string' ? new Date(d) : d
  if (!Number.isFinite(date.getTime())) return null
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${mm}/${dd}/${yyyy}`
}

/**
 * Strip illegal filename chars (`<>:"/\\|?*` + control chars), collapse
 * whitespace, trim, clamp to 200 chars. Windows allows 255 incl. extension —
 * the safe margin keeps room for the ".webm" suffix and any path prefix
 * the OS adds at save time.
 */
function sanitizeForFilename(s: string): string {
  let out = s
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (out.length > 200) out = out.slice(0, 200).trim()
  return out
}

/** Pick "webm" or "mp4" from the storage key extension. Defaults to webm. */
function inferExtFromStorageKey(key: string | null | undefined): 'webm' | 'mp4' {
  const lower = (key ?? '').toLowerCase()
  if (lower.endsWith('.mp4')) return 'mp4'
  return 'webm'
}

/**
 * Build the download filename for a call recording.
 *
 *   "333 Preston Road - 27m 30s - 05-04-2026 - Admin.webm"
 *
 * Any null/empty part is silently dropped. Always returns a usable filename
 * — worst case is "Call Recording.webm".
 */
export function buildRecordingDownloadName(
  input: RecordingLabelInput & { storageKey?: string | null }
): string {
  const ext = inferExtFromStorageKey(input.storageKey)
  const parts = [
    input.propertyAddress?.trim() || null,
    formatDurationLabel(input.durationSec ?? null),
    formatDateForFilename(input.startedAt ?? null),
    input.agentName?.trim() || null,
  ].filter((x): x is string => Boolean(x))
  const base = parts.length > 0 ? parts.join(' - ') : 'Call Recording'
  return `${sanitizeForFilename(base)}.${ext}`
}

/**
 * Build the on-screen display label for a call recording.
 *
 *   "333 Preston Road - 27m 30s - 05/04/2026 - Admin"
 *
 * Returns null when no parts are available, so the caller can hide the
 * header entirely instead of rendering an empty row.
 */
export function buildRecordingDisplayLabel(input: RecordingLabelInput): string | null {
  const parts = [
    input.propertyAddress?.trim() || null,
    formatDurationLabel(input.durationSec ?? null),
    formatDateForDisplay(input.startedAt ?? null),
    input.agentName?.trim() || null,
  ].filter((x): x is string => Boolean(x))
  return parts.length > 0 ? parts.join(' - ') : null
}
