'use client'

/**
 * Lightweight typeahead wrapper around an `<input>` that fetches
 * matching existing contacts as the user types and lets them pick a
 * match — turning the form into "edit existing" if they meant to
 * edit, instead of creating a duplicate.
 *
 * The component is field-agnostic: pass `field='firstName' | 'lastName'
 * | 'phone' | 'email'` and a `type='BUYER' | 'VENDOR'` and it talks
 * to /api/contacts/search to fetch suggestions.
 *
 * Selecting a suggestion fires `onSelectMatch(match)` so the parent
 * can route to the existing record's detail page (or auto-load the
 * form into edit mode for it). If the parent doesn't pass that
 * handler we just navigate to the buyer / vendor detail page.
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export interface ContactMatch {
  contactId: string
  buyerId: string | null
  vendorId: string | null
  firstName: string
  lastName: string
  phone: string
  email: string
  type: string
  phones: Array<{ label: string; number: string }>
  emails: Array<{ label: string; email: string }>
}

interface Props {
  value: string
  onChange: (next: string) => void
  field: 'firstName' | 'lastName' | 'phone' | 'email'
  type: 'BUYER' | 'VENDOR'
  placeholder?: string
  inputClassName?: string
  inputType?: 'text' | 'tel' | 'email'
  inputMode?: 'text' | 'tel' | 'email'
  autoComplete?: string
  onSelectMatch?: (match: ContactMatch) => void
}

export function ContactFieldAutocomplete({
  value,
  onChange,
  field,
  type,
  placeholder,
  inputClassName,
  inputType = 'text',
  inputMode,
  autoComplete,
  onSelectMatch,
}: Props) {
  const router = useRouter()
  const [matches, setMatches] = useState<ContactMatch[]>([])
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Debounced fetch — 200ms after the user stops typing. Cancels on
  // every keystroke so a fast typer doesn't burn a stale request.
  useEffect(() => {
    if (!value || value.trim().length < 2) {
      setMatches([])
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      fetch(
        `/api/contacts/search?type=${type}&field=${field}&q=${encodeURIComponent(value)}`,
        { signal: ctrl.signal },
      )
        .then((r) => r.json())
        .then((res) => {
          const data = Array.isArray(res?.data) ? res.data : []
          setMatches(data)
          setHighlight(0)
        })
        .catch(() => {})
    }, 200)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [value, field, type])

  // Close dropdown on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function pick(m: ContactMatch) {
    if (onSelectMatch) {
      onSelectMatch(m)
    } else {
      const target =
        type === 'VENDOR' && m.vendorId
          ? `/vendors/${m.vendorId}?edit=1`
          : type === 'BUYER' && m.buyerId
            ? `/buyers/${m.buyerId}?edit=1`
            : null
      if (target) router.push(target)
    }
    setOpen(false)
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || matches.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(matches[highlight])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        type={inputType}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        className={inputClassName}
        inputMode={inputMode}
        autoComplete={autoComplete}
      />
      {open && matches.length > 0 && (
        <div className="absolute left-0 right-0 z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          <p className="px-3 py-1.5 text-[10px] uppercase tracking-wide font-semibold text-gray-400 border-b border-gray-100">
            Existing contacts — pick one to open instead of creating a duplicate
          </p>
          {matches.map((m, i) => (
            <button
              key={m.contactId}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                pick(m)
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`w-full text-left px-3 py-2 text-[13px] flex items-center justify-between gap-3 ${
                i === highlight ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="font-medium text-gray-900">
                  {[m.firstName, m.lastName].filter(Boolean).join(' ') || '(unnamed)'}
                </span>
                <span className="block text-[11px] text-gray-500 truncate">
                  {m.phone || '—'} · {m.email || '—'}
                </span>
              </span>
              <span className="text-[10px] text-blue-600 font-semibold flex-shrink-0">
                Open →
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
