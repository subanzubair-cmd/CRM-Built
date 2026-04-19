'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Inbox, Mail, Users, UserCheck, Skull, UserMinus,
  GitBranch, Package, Warehouse, CheckCircle, Home as HomeIcon,
  Megaphone, PhoneCall, Calendar, ListChecks, Activity,
  Layers, BarChart3, Settings, ChevronLeft, ChevronRight, ChevronDown,
  Target, FileText, MessageCircle, ClipboardList, TrendingUp,
} from 'lucide-react'

const SIDEBAR_COLLAPSED_KEY = 'homeward-sidebar-collapsed'
const SUBMENU_KEY = 'homeward-sidebar-submenus'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
}

interface NavSection {
  label?: string
  key?: string
  collapsible?: boolean
  icon?: React.ElementType
  items: NavItem[]
}

interface Props {
  counts?: { dts: number; dta: number; warm: number }
}

function buildNav(): NavSection[] {
  return [
    {
      items: [
        { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        { label: 'Inbox', href: '/inbox', icon: Inbox },
      ],
    },
    {
      label: 'DTS',
      key: 'dts',
      collapsible: true,
      icon: Target,
      items: [
        { label: 'Active Leads', href: '/leads/dts', icon: Target },
        { label: 'Warm Leads', href: '/leads/warm?type=dts', icon: Users },
        { label: 'Dead Leads', href: '/leads/dead?type=dts', icon: Skull },
        { label: 'Referred to Agent', href: '/leads/referred?type=dts', icon: UserMinus },
      ],
    },
    {
      label: 'DTA',
      key: 'dta',
      collapsible: true,
      icon: UserCheck,
      items: [
        { label: 'Vetted Agents', href: '/leads/vetted-agents', icon: UserCheck },
        { label: 'Active Leads', href: '/leads/dta', icon: UserCheck },
        { label: 'Warm Leads', href: '/leads/warm?type=dta', icon: Users },
        { label: 'Dead Leads', href: '/leads/dead?type=dta', icon: Skull },
      ],
    },
    {
      label: 'Dispo',
      key: 'dispo',
      collapsible: true,
      icon: Package,
      items: [
        { label: 'Dispo', href: '/dispo', icon: Package },
      ],
    },
    {
      label: 'Pipelines',
      key: 'pipelines',
      collapsible: true,
      icon: GitBranch,
      items: [
        { label: 'Transaction Mgmt', href: '/tm', icon: GitBranch },
        { label: 'Inventory', href: '/inventory', icon: Warehouse },
        { label: 'Rental', href: '/rental', icon: HomeIcon },
        { label: 'Sold', href: '/sold', icon: CheckCircle },
      ],
    },
    {
      label: 'Contacts',
      key: 'contacts',
      collapsible: true,
      icon: Users,
      items: [
        { label: 'Buyers', href: '/buyers', icon: Users },
        { label: 'Vendors', href: '/vendors', icon: FileText },
      ],
    },
    {
      label: 'Tools',
      key: 'tools',
      collapsible: true,
      icon: ListChecks,
      items: [
        { label: 'Tasks', href: '/tasks', icon: ListChecks },
        { label: 'Calendar', href: '/calendar', icon: Calendar },
        { label: 'Email', href: '/email', icon: Mail },
        { label: 'List Stacking', href: '/list-stacking', icon: Layers },
      ],
    },
    {
      label: 'Activity',
      key: 'activity',
      collapsible: true,
      icon: Activity,
      items: [
        { label: 'Live Calls', href: '/calls', icon: PhoneCall },
        { label: 'Call Logs', href: '/calls?view=logs', icon: ClipboardList },
        { label: 'Scheduled SMS', href: '/scheduled-sms', icon: MessageCircle },
        { label: 'Activity Feed', href: '/activity', icon: Activity },
      ],
    },
    {
      label: 'KPIs',
      key: 'kpis',
      collapsible: true,
      icon: TrendingUp,
      items: [
        { label: 'Analytics', href: '/analytics', icon: BarChart3 },
      ],
    },
    {
      items: [
        { label: 'Settings', href: '/settings', icon: Settings },
      ],
    },
  ]
}

/* ── Flyout submenu shown on hover when sidebar is collapsed ─────────────── */
function CollapsedFlyout({
  section,
  isSectionActive,
  isActive,
}: {
  section: NavSection
  isSectionActive: boolean
  isActive: (href: string) => boolean
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const iconRef = useRef<HTMLDivElement>(null)
  const flyoutRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleEnter = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect()
      setPos({ top: rect.top, left: rect.right })
    }
    setOpen(true)
  }, [])

  const handleLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150)
  }, [])

  const Icon = section.icon!

  return (
    <>
      <div
        ref={iconRef}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        <div
          className={cn(
            'flex items-center justify-center py-2.5 px-2 transition-colors cursor-pointer',
            isSectionActive
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
          )}
        >
          <Icon className="w-5 h-5" />
        </div>
      </div>

      {/* Portal-rendered flyout so it's not clipped by sidebar overflow */}
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={flyoutRef}
          className="fixed z-[9999] min-w-[200px] bg-white border border-gray-200 rounded-lg shadow-xl py-2"
          style={{ top: pos.top, left: pos.left }}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          {/* Section header */}
          <div className="px-4 py-2 border-b border-gray-100 mb-1">
            <span className="text-xs font-bold text-gray-900 uppercase tracking-wider">
              {section.label}
            </span>
          </div>

          {/* Items */}
          {section.items.map((item) => {
            const active = isActive(item.href)
            const ItemIcon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  active
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                <ItemIcon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-blue-600' : 'text-gray-400')} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>,
        document.body
      )}
    </>
  )
}

/* ── Single icon with hover label (same flyout style, no delay) ──────────── */
function CollapsedSingleItem({ item, isActive: active }: { item: NavItem; isActive: boolean }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const iconRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleEnter = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect()
      setPos({ top: rect.top + rect.height / 2 - 14, left: rect.right })
    }
    setOpen(true)
  }, [])

  const handleLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => setOpen(false), 100)
  }, [])

  const Icon = item.icon

  return (
    <>
      <div ref={iconRef} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
        <Link
          href={item.href}
          className={cn(
            'flex items-center justify-center py-2.5 px-2 transition-colors',
            active
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
          )}
        >
          <Icon className="w-5 h-5" />
        </Link>
      </div>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-xl px-4 py-2"
          style={{ top: pos.top, left: pos.left }}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          <span className="text-xs font-bold text-gray-900 uppercase tracking-wider">
            {item.label}
          </span>
        </div>,
        document.body
      )}
    </>
  )
}

export function Sidebar({ counts }: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const nav = buildNav()
  const [collapsed, setCollapsed] = useState(false)
  const [openSubmenus, setOpenSubmenus] = useState<Record<string, boolean>>({
    dts: true, dta: false, dispo: true, pipelines: true,
    contacts: true, tools: true, activity: true, kpis: true,
  })

  useEffect(() => {
    const savedCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
    if (savedCollapsed === 'true') setCollapsed(true)
    try {
      const savedSubs = localStorage.getItem(SUBMENU_KEY)
      if (savedSubs) setOpenSubmenus(JSON.parse(savedSubs))
    } catch {}
    if (pathname.startsWith('/leads/dts') || pathname.startsWith('/leads/warm') || pathname.startsWith('/leads/dead') || pathname.startsWith('/leads/referred')) {
      setOpenSubmenus((prev) => ({ ...prev, dts: true }))
    }
    if (pathname.startsWith('/leads/dta')) {
      setOpenSubmenus((prev) => ({ ...prev, dta: true }))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleSidebar() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
  }

  function toggleSubmenu(key: string) {
    setOpenSubmenus((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      localStorage.setItem(SUBMENU_KEY, JSON.stringify(next))
      return next
    })
  }

  function isActive(href: string) {
    const [base, query] = href.split('?')
    const pathMatch = pathname === base || pathname.startsWith(base + '/')
    if (!pathMatch) return false
    // If the link has query params (e.g. ?type=dts), check they match the current URL
    if (query) {
      const linkParams = new URLSearchParams(query)
      for (const [key, val] of linkParams) {
        if (searchParams.get(key) !== val) return false
      }
    }
    return true
  }

  function checkSectionActive(section: NavSection) {
    return section.items.some((item) => isActive(item.href))
  }

  return (
    <aside className={cn(
      'flex-shrink-0 bg-white border-r border-gray-200 flex flex-col transition-all duration-200 overflow-hidden',
      collapsed ? 'w-[56px]' : 'w-[220px]'
    )}>
      {/* Top toggle */}
      <div className="border-b border-gray-200 py-1.5 flex-shrink-0">
        <button
          onClick={toggleSidebar}
          className={cn(
            'flex items-center gap-2 py-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors w-full',
            collapsed ? 'justify-center px-2' : 'px-4'
          )}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <><ChevronLeft className="w-4 h-4" /><span className="text-xs">Collapse</span></>}
        </button>
      </div>

      <nav className="py-2 flex-1 overflow-y-auto overflow-x-hidden scrollbar-none" style={{ scrollbarWidth: 'none' }}>
        {nav.map((section, sIdx) => (
          <div key={sIdx}>
            {sIdx > 0 && <div className="h-px bg-gray-100 my-1" />}

            {/* ── COLLAPSED MODE ── */}
            {collapsed ? (
              section.collapsible && section.icon ? (
                /* Collapsible section → show icon with hover flyout */
                <CollapsedFlyout
                  section={section}
                  isSectionActive={checkSectionActive(section)}
                  isActive={isActive}
                />
              ) : (
                /* Non-collapsible items (Dashboard, Inbox, Settings) → flyout label on hover */
                section.items.map((item) => (
                  <CollapsedSingleItem
                    key={item.href}
                    item={item}
                    isActive={isActive(item.href)}
                  />
                ))
              )
            ) : (
              /* ── EXPANDED MODE ── */
              <>
                {/* Section header */}
                {section.label && (
                  section.collapsible && section.key ? (
                    <button
                      onClick={() => toggleSubmenu(section.key!)}
                      className="w-full flex items-center justify-between px-4 pt-2.5 pb-1 hover:bg-gray-50 transition-colors rounded-sm"
                    >
                      <span className="text-[10.5px] font-bold text-gray-400 uppercase tracking-wider">
                        {section.label}
                      </span>
                      <ChevronDown className={cn(
                        'w-3 h-3 text-gray-400 transition-transform',
                        openSubmenus[section.key!] ? '' : '-rotate-90'
                      )} />
                    </button>
                  ) : (
                    <p className="px-4 pt-2.5 pb-1 text-[10.5px] font-bold text-gray-400 uppercase tracking-wider">
                      {section.label}
                    </p>
                  )
                )}

                {/* Items (shown if not collapsible, or submenu is open) */}
                {(!section.collapsible || !section.key || openSubmenus[section.key]) && (
                  section.items.map((item) => {
                    const active = isActive(item.href)
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-2.5 py-1.5 transition-colors',
                          section.collapsible ? 'px-6' : 'px-4',
                          active
                            ? 'bg-blue-50 text-blue-700 font-semibold'
                            : 'text-gray-600 hover:bg-gray-50',
                        )}
                      >
                        <Icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-blue-600' : 'text-gray-400')} />
                        <span className="flex-1 truncate text-sm">{item.label}</span>
                      </Link>
                    )
                  })
                )}
              </>
            )}
          </div>
        ))}
      </nav>

      {/* Bottom toggle */}
      <div className="border-t border-gray-200 py-2 flex-shrink-0">
        <button
          onClick={toggleSidebar}
          className={cn(
            'flex items-center gap-2 py-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors w-full',
            collapsed ? 'justify-center px-2' : 'px-4'
          )}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
