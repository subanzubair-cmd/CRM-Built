import type { Metadata } from 'next'
import NextTopLoader from 'nextjs-toploader'
import { Toaster } from 'sonner'
import { PageLoadingBar } from '@/components/ui/PageLoadingBar'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Homeward Partners',
    // Per-page titles like "Dashboard" render as "Dashboard · Homeward Partners"
    template: '%s · Homeward Partners',
  },
  description: 'Real estate acquisitions and pipeline management',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <NextTopLoader color="#3b82f6" height={3} showSpinner={false} />
        <PageLoadingBar />
        <Toaster position="top-right" richColors closeButton />
        {children}
      </body>
    </html>
  )
}
