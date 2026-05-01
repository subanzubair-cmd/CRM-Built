'use client'

/**
 * Debounced hook that checks whether a phone/email value already
 * exists on another contact in the system. Returns the matching
 * contact (if any) so the form can render an inline duplicate
 * warning beneath the field.
 *
 * Phone comparison is digit-only (last 10): "(469) 555-1234" matches
 * "+14695551234". Email comparison is case-insensitive.
 *
 * Pass `excludeContactId` in edit mode so the currently-being-edited
 * contact doesn't match itself.
 */

import { useEffect, useRef, useState } from 'react'
import type { ContactMatch } from '@/components/buyers/ContactFieldAutocomplete'

interface Options {
  value: string
  field: 'phone' | 'email'
  type: 'BUYER' | 'VENDOR'
  /** Exclude this contact id from results (prevents self-match in edit mode) */
  excludeContactId?: string
}

interface Result {
  match: ContactMatch | null
  checking: boolean
}

/** Strip to digits, take last 10 (US phone normalisation). */
function phoneDigits(v: string): string {
  const d = v.replace(/\D/g, '')
  return d.length > 10 ? d.slice(-10) : d
}

/** True when `candidate` is an exact match for `input` on the given field. */
function isExactMatch(
  candidate: ContactMatch,
  input: string,
  field: 'phone' | 'email',
): boolean {
  if (field === 'email') {
    const lc = input.toLowerCase().trim()
    if (candidate.email && candidate.email.toLowerCase().trim() === lc) return true
    return candidate.emails.some((e) => e.email.toLowerCase().trim() === lc)
  }
  // Phone — compare digit-only representations (last 10 digits).
  const inputDigits = phoneDigits(input)
  if (inputDigits.length < 7) return false
  if (candidate.phone && phoneDigits(candidate.phone) === inputDigits) return true
  return candidate.phones.some((p) => phoneDigits(p.number) === inputDigits)
}

export function useDuplicateCheck({ value, field, type, excludeContactId }: Options): Result {
  const [match, setMatch] = useState<ContactMatch | null>(null)
  const [checking, setChecking] = useState(false)
  const prevRef = useRef('')

  useEffect(() => {
    const trimmed = value.trim()

    // Skip until there's enough to search: 7+ digits for phone, 5+ chars for email.
    const minLen = field === 'phone' ? 7 : 5
    const testLen = field === 'phone' ? phoneDigits(trimmed).length : trimmed.length
    if (testLen < minLen) {
      setMatch(null)
      setChecking(false)
      return
    }

    // Skip if value hasn't materially changed.
    const normalised = field === 'phone' ? phoneDigits(trimmed) : trimmed.toLowerCase()
    if (normalised === prevRef.current) return
    prevRef.current = normalised

    setChecking(true)
    const ctrl = new AbortController()

    const timer = setTimeout(() => {
      const qs = new URLSearchParams({
        type,
        field,
        q: trimmed,
      })
      if (excludeContactId) qs.set('excludeContactId', excludeContactId)

      fetch(`/api/contacts/search?${qs.toString()}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((res) => {
          const data: ContactMatch[] = Array.isArray(res?.data) ? res.data : []
          // Filter to exact matches only — the search API returns substring hits.
          const exact = data.find((c) => isExactMatch(c, trimmed, field))
          setMatch(exact ?? null)
        })
        .catch(() => {})
        .finally(() => setChecking(false))
    }, 300)

    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [value, field, type, excludeContactId])

  return { match, checking }
}
