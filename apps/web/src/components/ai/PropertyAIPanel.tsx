'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, Flame } from 'lucide-react'

interface Props {
  propertyId: string
  initialSummary: string | null
  initialIsHot: boolean
}

export function PropertyAIPanel({ propertyId, initialSummary, initialIsHot }: Props) {
  const router = useRouter()
  const [summary, setSummary] = useState(initialSummary)
  const [isHot, setIsHot] = useState(initialIsHot)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [scoringLead, setScoringLead] = useState(false)
  const [scoreResult, setScoreResult] = useState<number | null>(null)
  const [error, setError] = useState('')

  async function handleSummarize() {
    setGeneratingSummary(true)
    setError('')
    try {
      const res = await fetch(`/api/properties/${propertyId}/summarize`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setSummary(data.summary)
      router.refresh()
    } catch {
      setError('Failed to generate summary. Check your API key.')
    } finally {
      setGeneratingSummary(false)
    }
  }

  async function handleScore() {
    setScoringLead(true)
    setError('')
    try {
      const res = await fetch(`/api/properties/${propertyId}/score`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setScoreResult(data.score)
      setIsHot(data.isHot)
      router.refresh()
    } catch {
      setError('Failed to score lead. Check your API key.')
    } finally {
      setScoringLead(false)
    }
  }

  const scoreColor =
    scoreResult !== null
      ? scoreResult >= 75
        ? 'bg-red-500'
        : scoreResult >= 50
        ? 'bg-orange-400'
        : 'bg-blue-300'
      : 'bg-gray-200'

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-500" />
          <h3 className="text-sm font-semibold text-gray-800">AI Insights</h3>
        </div>
        {isHot && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-orange-600 bg-orange-50 border border-orange-100 rounded-full px-2 py-0.5">
            <Flame className="w-3 h-3" />
            Hot Lead
          </span>
        )}
      </div>

      {/* Lead Summary */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Lead Summary</p>
          <button
            onClick={handleSummarize}
            disabled={generatingSummary}
            className="flex items-center gap-1 text-[11px] font-medium text-purple-600 hover:text-purple-800 disabled:opacity-50"
          >
            {generatingSummary ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            {generatingSummary ? 'Generating…' : summary ? 'Regenerate' : 'Generate'}
          </button>
        </div>
        {summary ? (
          <p className="text-[12px] text-gray-600 leading-relaxed">{summary}</p>
        ) : (
          <p className="text-[12px] text-gray-400 italic">
            Click Generate to create an AI summary of this lead.
          </p>
        )}
      </div>

      {/* Hot Lead Score */}
      <div className="space-y-1.5 pt-2 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Hot Lead Score</p>
          <button
            onClick={handleScore}
            disabled={scoringLead}
            className="flex items-center gap-1 text-[11px] font-medium text-orange-600 hover:text-orange-800 disabled:opacity-50"
          >
            {scoringLead ? <Loader2 className="w-3 h-3 animate-spin" /> : <Flame className="w-3 h-3" />}
            {scoringLead ? 'Scoring…' : 'Score Lead'}
          </button>
        </div>
        {scoreResult !== null ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${scoreColor}`}
                style={{ width: `${scoreResult}%` }}
              />
            </div>
            <span className="text-[12px] font-bold text-gray-700 w-8 text-right">{scoreResult}</span>
          </div>
        ) : (
          <p className="text-[12px] text-gray-400 italic">
            Score this lead to see its likelihood to close (0–100).
          </p>
        )}
      </div>

      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  )
}
