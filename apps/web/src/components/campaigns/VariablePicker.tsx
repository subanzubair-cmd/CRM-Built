'use client'

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'

/**
 * VariablePicker — a textarea that opens an "@" autocomplete dropdown
 * for merge variables. The spec's SMS / task editors say "type @ for
 * variable fields"; the user picks a variable and we insert the
 * `{{token}}` form the backend actually substitutes.
 *
 * Why double-brace tokens instead of `@First_Name`? The shared
 * `substituteTemplateVars` helper (`packages/shared/src/utils/templateVars.ts`)
 * is the single point of substitution for drip executor + status
 * automations + email templates. Reproducing two grammars across the
 * codebase invites bugs; instead we keep `@` as a UX-only trigger and
 * the saved string uses the same `{{firstName}}` form everything else
 * already knows how to render.
 */

export type VariableOption = {
  /** Token inserted into the text — usually `{{firstName}}`. */
  token: string
  /** Human label shown in the dropdown. */
  label: string
  /** Optional secondary line — describes the source (e.g. "Lead's primary contact"). */
  description?: string
}

export const DEFAULT_VARIABLES: VariableOption[] = [
  { token: '{{firstName}}', label: 'First Name', description: "Contact's first name" },
  { token: '{{lastName}}', label: 'Last Name', description: "Contact's last name" },
  { token: '{{fullName}}', label: 'Full Name', description: 'First + last name' },
  { token: '{{email}}', label: 'Email', description: "Contact's email" },
  { token: '{{phone}}', label: 'Phone', description: "Contact's phone" },
  { token: '{{propertyAddress}}', label: 'Property Address', description: 'Street, city, state' },
  { token: '{{address}}', label: 'Street Address', description: 'Street only' },
  { token: '{{propertyCity}}', label: 'City' },
  { token: '{{propertyState}}', label: 'State' },
  { token: '{{propertyZip}}', label: 'Zip' },
  { token: '{{leadNumber}}', label: 'Lead Number', description: "Lead's tracking number" },
  { token: '{{agentName}}', label: 'Lead Manager', description: 'Currently logged-in user' },
  { token: '{{campaignName}}', label: 'Campaign Name' },
]

type Props = {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  rows?: number
  disabled?: boolean
  required?: boolean
  variables?: VariableOption[]
  className?: string
  /** Optional label rendered above the textarea. */
  label?: string
  /** Optional helper text rendered below. */
  hint?: string
}

export type VariablePickerHandle = {
  focus: () => void
}

export const VariablePicker = forwardRef<VariablePickerHandle, Props>(function VariablePicker(
  { value, onChange, placeholder, rows = 4, disabled, required, variables, className, label, hint },
  ref,
) {
  const ALL = useMemo(() => variables ?? DEFAULT_VARIABLES, [variables])

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  /** Index of the `@` character that opened this picker, in the textarea value. */
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null)
  const [highlight, setHighlight] = useState(0)

  useImperativeHandle(ref, () => ({ focus: () => textareaRef.current?.focus() }), [])

  const filtered = useMemo(() => {
    if (!open) return []
    const q = query.toLowerCase()
    if (!q) return ALL
    return ALL.filter(
      (v) =>
        v.label.toLowerCase().includes(q) ||
        v.token.toLowerCase().includes(q) ||
        (v.description?.toLowerCase().includes(q) ?? false),
    )
  }, [ALL, query, open])

  // Keep highlight in range if the filter shrinks.
  useEffect(() => {
    if (highlight >= filtered.length) setHighlight(0)
  }, [filtered.length, highlight])

  function closePicker() {
    setOpen(false)
    setAnchorIndex(null)
    setQuery('')
    setHighlight(0)
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value
    const cursor = e.target.selectionStart ?? next.length
    onChange(next)

    // If picker is open, recompute the query from anchor → cursor; if
    // the anchor character was deleted or the user typed whitespace,
    // close the picker.
    if (open && anchorIndex !== null) {
      if (cursor < anchorIndex || next[anchorIndex] !== '@') {
        closePicker()
        return
      }
      const partial = next.slice(anchorIndex + 1, cursor)
      if (/\s/.test(partial)) {
        closePicker()
        return
      }
      setQuery(partial)
      return
    }

    // Detect a fresh "@" keystroke: cursor sits just past the last char
    // and that char is "@" preceded by start-of-text or whitespace.
    if (next[cursor - 1] === '@') {
      const prev = next[cursor - 2]
      if (prev === undefined || /\s/.test(prev)) {
        setOpen(true)
        setAnchorIndex(cursor - 1)
        setQuery('')
        setHighlight(0)
      }
    }
  }

  function insertToken(token: string) {
    if (anchorIndex === null) return
    const ta = textareaRef.current
    const cursor = ta?.selectionStart ?? value.length
    const before = value.slice(0, anchorIndex)
    const after = value.slice(cursor)
    const next = `${before}${token}${after}`
    onChange(next)
    closePicker()
    // Move caret to end of inserted token on the next tick so React
    // has applied the new value.
    requestAnimationFrame(() => {
      const t = textareaRef.current
      if (!t) return
      const pos = before.length + token.length
      t.focus()
      t.setSelectionRange(pos, pos)
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open || filtered.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => (h + 1) % filtered.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => (h - 1 + filtered.length) % filtered.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const choice = filtered[highlight]
      if (choice) insertToken(choice.token)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closePicker()
    }
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      {label && (
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
          {label}
        </label>
      )}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Defer so a click on a dropdown row can fire first.
          setTimeout(() => closePicker(), 120)
        }}
        rows={rows}
        disabled={disabled}
        required={required}
        placeholder={placeholder ?? 'type @ for variable fields'}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y leading-relaxed disabled:bg-gray-50 disabled:text-gray-400"
      />
      {open && filtered.length > 0 && (
        <div
          role="listbox"
          className="absolute z-20 left-2 right-2 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto"
        >
          {filtered.map((opt, i) => (
            <button
              key={opt.token}
              type="button"
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                // Prevent the textarea from blurring before we can
                // insert — onBlur uses a setTimeout fallback but
                // mousedown fires earlier and the blur handler would
                // cancel before the click registers.
                e.preventDefault()
                insertToken(opt.token)
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`w-full text-left px-3 py-2 text-sm flex items-baseline justify-between gap-3 ${
                i === highlight ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="flex flex-col">
                <span className="font-medium">{opt.label}</span>
                {opt.description && (
                  <span className="text-[11px] text-gray-400">{opt.description}</span>
                )}
              </span>
              <span className="font-mono text-[11px] text-gray-400">{opt.token}</span>
            </button>
          ))}
        </div>
      )}
      {hint && <p className="mt-1.5 text-[11px] text-gray-400">{hint}</p>}
    </div>
  )
})
