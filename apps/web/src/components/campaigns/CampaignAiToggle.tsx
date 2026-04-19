'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'

interface Props {
  campaignId: string
  initialEnabled: boolean
}

export function CampaignAiToggle({ campaignId, initialEnabled }: Props) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(initialEnabled)
  const [isPending, startTransition] = useTransition()

  async function toggle() {
    const next = !enabled
    setEnabled(next)
    await fetch(`/api/campaigns/${campaignId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiEnabled: next }),
    })
    startTransition(() => router.refresh())
  }

  return (
    <div className="flex items-center justify-between py-2 border-t border-gray-100 mt-2">
      <div className="flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-purple-500" />
        <span className="text-sm text-gray-600">AI Personalization</span>
      </div>
      <button
        onClick={toggle}
        disabled={isPending}
        className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? 'bg-purple-500' : 'bg-gray-200'} disabled:opacity-50`}
        title={enabled ? 'AI personalization on — disable' : 'Enable AI personalization'}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  )
}
