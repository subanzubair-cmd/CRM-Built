'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Global loading bar that shows during page transitions.
 * Works with both router.push() AND window.location.href.
 *
 * Usage: Call window.showPageLoading() before window.location.href redirects.
 */
export function PageLoadingBar() {
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const pathname = usePathname()

  // Reset on route change
  useEffect(() => {
    setLoading(false)
    setProgress(0)
  }, [pathname])

  // Expose global function to trigger loading
  useEffect(() => {
    ;(window as any).showPageLoading = () => {
      setLoading(true)
      setProgress(30)
      // Animate progress
      const t1 = setTimeout(() => setProgress(60), 500)
      const t2 = setTimeout(() => setProgress(80), 1500)
      const t3 = setTimeout(() => setProgress(90), 3000)
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
    }
    return () => { delete (window as any).showPageLoading }
  }, [])

  if (!loading) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999]">
      <div
        className="h-1 bg-blue-500 transition-all duration-500 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}
