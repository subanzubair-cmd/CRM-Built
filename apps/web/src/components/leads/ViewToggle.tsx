'use client'
import { useEffect } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { LayoutList, LayoutGrid } from 'lucide-react'

const STORAGE_KEY = 'homeward-lead-view-preference'

interface ViewToggleProps {
  currentView: string
}

export function ViewToggle({ currentView }: ViewToggleProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // On mount: if no view param in URL, apply saved preference (if it differs from default)
  useEffect(() => {
    const urlView = searchParams.get('view')
    if (!urlView) {
      const saved = localStorage.getItem(STORAGE_KEY)
      // Default is 'board', so only redirect if user explicitly saved 'table'
      if (saved === 'table') {
        const params = new URLSearchParams(searchParams.toString())
        params.set('view', 'table')
        router.replace(`${pathname}?${params.toString()}`)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function switchView(view: string) {
    localStorage.setItem(STORAGE_KEY, view)
    const params = new URLSearchParams(searchParams.toString())
    params.set('view', view)
    router.replace(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
      <button
        onClick={() => switchView('table')}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
          currentView === 'table'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <LayoutList className="w-3.5 h-3.5" />
        Table
      </button>
      <button
        onClick={() => switchView('board')}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
          currentView !== 'table'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <LayoutGrid className="w-3.5 h-3.5" />
        Board
      </button>
    </div>
  )
}
