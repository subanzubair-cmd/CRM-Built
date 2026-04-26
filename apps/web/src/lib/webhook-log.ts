/**
 * Tiny in-memory ring buffer of inbound webhook attempts.
 *
 * Used by the webhook routes to record every POST that lands —
 * timestamp, headers, parsed event_type, and the response status the
 * route returned. Diagnostic endpoint reads it back so the operator
 * can see whether Telnyx is actually hitting the URL (and what the
 * route did with the request).
 *
 * In dev / single-process: rock solid.
 * In multi-instance prod: each instance has its own buffer — fine for
 * spot debugging, not for audit logging. Persistent webhook-event
 * tracking should go through the existing CommEvent table when we
 * build that out for production diagnostics.
 *
 * Stores in `globalThis` so Next.js HMR doesn't reset the buffer on
 * every code change.
 */

export interface WebhookHit {
  /** epoch ms */
  ts: number
  /** which webhook route the hit landed on */
  route: 'telnyx' | 'twilio' | 'signalhouse'
  /** signature-style header present (telnyx-signature-ed25519, x-twilio-signature, etc.) */
  hasSignature: boolean
  /** parsed event type if we got far enough to JSON-parse (e.g. message.received, call.initiated) */
  eventType: string | null
  /** the HTTP status this route returned to the provider */
  responseStatus: number
  /** short human note: 'signature verified', 'signature missing', 'signature invalid', 'ignored', 'persisted' */
  outcome: string
  /** e.164 from-phone, when extractable from payload */
  fromPhone: string | null
  /** e.164 to-phone, when extractable from payload */
  toPhone: string | null
  /** User-Agent header — lets the operator distinguish real Telnyx
   *  hits ('telnyx-webhooks/...') from internal probes ('node', 'curl',
   *  'undici', 'Next.js Middleware') in the diagnostic UI. */
  userAgent: string | null
  /** Best-guess source classification based on User-Agent. */
  source: 'telnyx' | 'probe' | 'unknown'
  /** All inbound headers (lowercased keys). Captured so the operator
   *  can verify Telnyx is actually sending telnyx-signature-ed25519
   *  and telnyx-timestamp. Auth/cookie headers are stripped. */
  headers: Record<string, string>
}

/**
 * Heuristic: classify a request as a real Telnyx webhook delivery
 * vs. an internal CRM probe based on User-Agent. Telnyx sends
 * `telnyx-webhooks/<version>`; our reachability check uses Node's
 * built-in fetch which sends `undici`; curl probes use `curl/...`.
 */
export function classifySource(userAgent: string | null): 'telnyx' | 'probe' | 'unknown' {
  if (!userAgent) return 'unknown'
  const ua = userAgent.toLowerCase()
  if (ua.includes('telnyx')) return 'telnyx'
  if (ua.includes('undici') || ua.includes('node') || ua.includes('curl') || ua.includes('next')) return 'probe'
  return 'unknown'
}

/**
 * Snapshot request headers for the diagnostic UI. Strips obvious
 * auth/cookie headers so we don't accidentally leak session creds
 * into the in-memory log. ngrok adds its own diagnostic headers
 * (x-forwarded-for, x-original-*) which we keep — they're useful for
 * confirming Telnyx is actually hitting our public URL.
 */
export function snapshotHeaders(req: Request): Record<string, string> {
  const out: Record<string, string> = {}
  const SKIP = new Set(['cookie', 'authorization', 'x-csrf-token'])
  req.headers.forEach((value, key) => {
    if (SKIP.has(key.toLowerCase())) return
    out[key.toLowerCase()] = value
  })
  return out
}

const MAX = 50

interface Bucket {
  hits: WebhookHit[]
}

const g = globalThis as any
const KEY = '__crm_webhook_log__'
if (!g[KEY]) {
  g[KEY] = { hits: [] } satisfies Bucket
}
const bucket: Bucket = g[KEY]

export function recordHit(hit: WebhookHit): void {
  bucket.hits.push(hit)
  // Trim from the front to keep memory bounded.
  if (bucket.hits.length > MAX) {
    bucket.hits.splice(0, bucket.hits.length - MAX)
  }
}

export function getHits(): WebhookHit[] {
  // Return newest-first so the diagnostic UI puts the latest hit on top.
  return [...bucket.hits].reverse()
}

export function clearHits(): void {
  bucket.hits.length = 0
}
