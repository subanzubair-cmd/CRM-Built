'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export interface TabDef {
  key: string
  label: string
}

interface Props {
  tabs: TabDef[]
  activeTab: string
}

function TabsInner({ tabs, activeTab }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function goToTab(key: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', key)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="flex items-center gap-0 overflow-x-auto scrollbar-none">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => goToTab(t.key)}
          className={cn(
            'flex-shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
            activeTab === t.key
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function DetailPageTabs(props: Props) {
  return (
    <Suspense fallback={<div className="h-10" />}>
      <TabsInner {...props} />
    </Suspense>
  )
}
