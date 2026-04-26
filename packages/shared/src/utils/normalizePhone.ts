/**
 * Phone-number normalization for CRM-wide consistency.
 *
 * Canonical storage format: E.164, US-only — `+1XXXXXXXXXX` (12 chars).
 *
 * Why we standardize:
 *   - Inbound webhooks (Telnyx / Twilio / SignalHouse) all deliver
 *     E.164 with the leading `+` and country code. If our DB stores
 *     `(469) 799-7747` or `4697997747` we can't match the inbound
 *     caller against existing contacts → "Unknown Caller" popup
 *     even though the lead exists.
 *   - Manual lead-form input is inconsistent — agents type
 *     `4697997747`, `469-799-7747`, `(469) 799-7747`, etc.
 *
 * Strategy: extract digits, recognize US 10-digit + 11-digit-with-1
 * variants, return E.164. Anything that doesn't fit returns null and
 * the caller decides whether to reject the input or pass it through
 * as-is (we generally pass through for international or unknown
 * formats so we don't lose data).
 *
 * For displaying the phone to humans, use `formatPhoneForDisplay`
 * which round-trips E.164 → `(XXX) XXX-XXXX`.
 */

const E164_US_REGEX = /^\+1[2-9]\d{9}$/

/**
 * Normalize any phone-number input to E.164 (`+1XXXXXXXXXX`).
 *
 * Returns null if the input can't be parsed as a US 10/11-digit
 * number — caller decides whether to reject or store-as-is.
 *
 * Examples:
 *   "4697997747"        → "+14697997747"
 *   "+14697997747"      → "+14697997747"
 *   "1-469-799-7747"    → "+14697997747"
 *   "(469) 799-7747"    → "+14697997747"
 *   "469.799.7747"      → "+14697997747"
 *   "  +14697997747 "   → "+14697997747"
 *   ""                  → null
 *   "abc"               → null
 *   "12345"             → null  (too short)
 */
export function toE164(input: string | null | undefined): string | null {
  if (!input) return null
  const trimmed = String(input).trim()
  if (!trimmed) return null

  // Already E.164? Validate strictly and return as-is.
  if (trimmed.startsWith('+')) {
    const digits = trimmed.replace(/\D/g, '')
    const candidate = `+${digits}`
    if (E164_US_REGEX.test(candidate)) return candidate
    // Non-US E.164 — pass through, we don't have country-aware parsing
    if (digits.length >= 10 && digits.length <= 15) return candidate
    return null
  }

  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 10) {
    // US 10-digit, prepend +1 (only if NPA is valid — not 0/1)
    if (digits[0] === '0' || digits[0] === '1') return null
    return `+1${digits}`
  }
  if (digits.length === 11 && digits[0] === '1') {
    // US with leading 1
    if (digits[1] === '0' || digits[1] === '1') return null
    return `+${digits}`
  }
  return null
}

/**
 * All format variants a single phone might appear as in the DB —
 * useful for tolerant lookups while we migrate stored values to E.164.
 *
 * Example: toE164("+14697997747") → ["+14697997747", "14697997747",
 * "4697997747", "(469) 799-7747"].
 *
 * Use with `{ [Op.in]: phoneVariants(input) }` so the query matches
 * however the legacy data was stored.
 */
export function phoneVariants(input: string | null | undefined): string[] {
  if (!input) return []
  const e164 = toE164(input)
  const raw = String(input).trim()
  const digits = raw.replace(/\D/g, '')
  const last10 = digits.slice(-10)
  const variants = new Set<string>()
  if (raw) variants.add(raw)
  if (e164) variants.add(e164)
  if (digits) variants.add(digits)
  if (last10 && last10.length === 10) {
    variants.add(last10)
    variants.add(`(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`)
    variants.add(`${last10.slice(0, 3)}-${last10.slice(3, 6)}-${last10.slice(6)}`)
    variants.add(`+1${last10}`)
    variants.add(`1${last10}`)
  }
  return Array.from(variants)
}

/**
 * Format an E.164 number for human display. US numbers render as
 * `(XXX) XXX-XXXX`; non-US falls back to the raw E.164.
 */
export function formatPhoneForDisplay(input: string | null | undefined): string {
  if (!input) return ''
  const e164 = toE164(input)
  if (!e164) return String(input)
  if (e164.startsWith('+1') && e164.length === 12) {
    const d = e164.slice(2)
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  }
  return e164
}
