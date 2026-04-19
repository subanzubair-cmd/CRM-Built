'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, FileText, MessageSquare, CheckSquare, Paperclip, User, Building2 } from 'lucide-react'

interface PropertyRef {
  id: string
  streetAddress: string | null
  propertyStatus: string
  leadType: string | null
}

function getDetailUrl(p: PropertyRef): string {
  switch (p.propertyStatus) {
    case 'IN_TM': return `/tm/${p.id}`
    case 'IN_INVENTORY': return `/inventory/${p.id}`
    case 'IN_DISPO': return `/dispo/${p.id}`
    case 'SOLD': return `/sold/${p.id}`
    case 'RENTAL': return `/rental/${p.id}`
    default: return `/leads/${p.leadType === 'DIRECT_TO_AGENT' ? 'dta' : 'dts'}/${p.id}`
  }
}

interface SearchResults {
  properties: Array<{ id: string; streetAddress: string | null; city: string | null; state: string | null; zip: string | null; propertyStatus: string; leadType: string | null }>
  contacts: Array<{ id: string; firstName: string | null; lastName: string | null; phone: string | null; email: string | null; properties: Array<{ property: PropertyRef }> }>
  messages: Array<{ id: string; body: string | null; channel: string; createdAt: string; property: PropertyRef | null }>
  notes: Array<{ id: string; body: string; createdAt: string; property: PropertyRef | null }>
  tasks: Array<{ id: string; title: string; status: string; dueDate: string | null; property: PropertyRef | null }>
  files: Array<{ id: string; name: string; fileType: string; property: PropertyRef | null }>
}

export function GlobalSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults(null); setOpen(false); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.results)
      setOpen(true)
    } finally {
      setLoading(false)
    }
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 250)
  }

  function navigate(url: string) {
    setOpen(false)
    setQuery('')
    setResults(null)
    router.push(url)
  }

  // Close on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  // Keyboard shortcut: Cmd/Ctrl+K
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const hasResults = results && (
    results.properties.length > 0 ||
    results.contacts.length > 0 ||
    results.messages.length > 0 ||
    results.notes.length > 0 ||
    results.tasks.length > 0 ||
    results.files.length > 0
  )

  return (
    <div ref={containerRef} className="flex-1 max-w-[420px] relative">
      <div className="flex items-center bg-slate-50 border border-gray-200 rounded-lg h-[34px] px-3 gap-2 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
        {loading
          ? <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          : <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        }
        <input
          ref={inputRef}
          value={query}
          onChange={handleChange}
          onFocus={() => { if (results && query.length >= 2) setOpen(true) }}
          placeholder="Search properties, contacts, messages..."
          className="flex-1 bg-transparent text-[13px] text-gray-700 placeholder-gray-400 outline-none min-w-0"
        />
        <span className="ml-auto text-[11px] bg-slate-100 border border-gray-200 rounded px-1.5 py-0.5 text-gray-400 flex-shrink-0 select-none">
          ⌘K
        </span>
      </div>

      {open && (
        <div className="absolute top-[38px] left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-[480px] overflow-y-auto">
          {!hasResults ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">No results for "{query}"</div>
          ) : (
            <div className="py-1">
              {/* Properties */}
              {results!.properties.length > 0 && (
                <Section label="Properties" icon={<Building2 className="w-3 h-3" />}>
                  {results!.properties.map((p) => (
                    <ResultRow
                      key={p.id}
                      primary={p.streetAddress ?? 'Unknown'}
                      secondary={[p.city, p.state, p.zip].filter(Boolean).join(', ')}
                      badge={p.propertyStatus.replace(/_/g, ' ')}
                      onClick={() => navigate(getDetailUrl(p))}
                    />
                  ))}
                </Section>
              )}

              {/* Contacts */}
              {results!.contacts.length > 0 && (
                <Section label="Contacts" icon={<User className="w-3 h-3" />}>
                  {results!.contacts.map((c) => {
                    const prop = c.properties[0]?.property
                    return (
                      <ResultRow
                        key={c.id}
                        primary={[c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unknown'}
                        secondary={c.phone ?? c.email ?? ''}
                        badge={prop ? prop.propertyStatus.replace(/_/g, ' ') : undefined}
                        onClick={prop ? () => navigate(getDetailUrl(prop) + '?tab=contacts') : undefined}
                      />
                    )
                  })}
                </Section>
              )}

              {/* Messages */}
              {results!.messages.length > 0 && (
                <Section label="Messages" icon={<MessageSquare className="w-3 h-3" />}>
                  {results!.messages.map((m) => (
                    <ResultRow
                      key={m.id}
                      primary={m.body?.slice(0, 60) ?? ''}
                      secondary={m.property?.streetAddress ?? ''}
                      badge={m.channel}
                      onClick={m.property ? () => navigate(getDetailUrl(m.property!) + '?tab=comms') : undefined}
                    />
                  ))}
                </Section>
              )}

              {/* Notes */}
              {results!.notes.length > 0 && (
                <Section label="Notes" icon={<FileText className="w-3 h-3" />}>
                  {results!.notes.map((n) => (
                    <ResultRow
                      key={n.id}
                      primary={n.body.slice(0, 60)}
                      secondary={n.property?.streetAddress ?? ''}
                      onClick={n.property ? () => navigate(getDetailUrl(n.property!) + '?tab=notes') : undefined}
                    />
                  ))}
                </Section>
              )}

              {/* Tasks */}
              {results!.tasks.length > 0 && (
                <Section label="Tasks" icon={<CheckSquare className="w-3 h-3" />}>
                  {results!.tasks.map((t) => (
                    <ResultRow
                      key={t.id}
                      primary={t.title}
                      secondary={t.property?.streetAddress ?? ''}
                      badge={t.status}
                      onClick={t.property ? () => navigate(getDetailUrl(t.property!) + '?tab=tasks') : undefined}
                    />
                  ))}
                </Section>
              )}

              {/* Files */}
              {results!.files.length > 0 && (
                <Section label="Files" icon={<Paperclip className="w-3 h-3" />}>
                  {results!.files.map((f) => (
                    <ResultRow
                      key={f.id}
                      primary={f.name}
                      secondary={f.property?.streetAddress ?? ''}
                      badge={f.fileType}
                      onClick={f.property ? () => navigate(getDetailUrl(f.property!) + '?tab=documents') : undefined}
                    />
                  ))}
                </Section>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide bg-slate-50">
        {icon}
        {label}
      </div>
      {children}
    </div>
  )
}

function ResultRow({ primary, secondary, badge, onClick }: {
  primary: string
  secondary?: string
  badge?: string
  onClick?: () => void
}) {
  const disabled = !onClick
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
        disabled ? 'opacity-50 cursor-default' : 'hover:bg-blue-50 cursor-pointer'
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-gray-800 truncate font-medium">{primary}</p>
        {secondary && <p className="text-[11px] text-gray-400 truncate">{secondary}</p>}
      </div>
      {badge && (
        <span className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 capitalize flex-shrink-0">
          {badge.replace(/_/g, ' ').toLowerCase()}
        </span>
      )}
    </button>
  )
}
