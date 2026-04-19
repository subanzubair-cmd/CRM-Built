'use client'

import { useState, useEffect } from 'react'
import { Target } from 'lucide-react'

const GOAL_TYPES = [
  { type: 'REVENUE', label: 'Annual Revenue', color: 'bg-emerald-500', textColor: 'text-emerald-700', borderColor: 'border-emerald-200', bgColor: 'bg-emerald-50' },
  { type: 'MARKETING_SPEND', label: 'Marketing Budget', color: 'bg-blue-500', textColor: 'text-blue-700', borderColor: 'border-blue-200', bgColor: 'bg-blue-50' },
  { type: 'NET_INCOME', label: 'Net Income', color: 'bg-purple-500', textColor: 'text-purple-700', borderColor: 'border-purple-200', bgColor: 'bg-purple-50' },
]

interface Props {
  yearToDateRevenue?: number
}

export function GoalEditorWidget({ yearToDateRevenue = 0 }: Props) {
  const year = new Date().getFullYear()
  const [goals, setGoals] = useState<Record<string, number>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [inputVal, setInputVal] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/goals?year=${year}`)
      .then((r) => r.json())
      .then((j) => {
        const map: Record<string, number> = {}
        for (const g of (j.goals ?? j.data ?? [])) {
          map[g.type] = Number(g.target)
        }
        setGoals(map)
      })
  }, [year])

  async function save(type: string) {
    const target = parseFloat(inputVal.replace(/[^0-9.]/g, ''))
    if (isNaN(target) || target < 0) { setEditing(null); return }
    setSaving(true)
    await fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, type, target }),
    })
    setGoals((prev) => ({ ...prev, [type]: target }))
    setEditing(null)
    setInputVal('')
    setSaving(false)
  }

  const actuals: Record<string, number> = {
    REVENUE: yearToDateRevenue,
    MARKETING_SPEND: 0,
    NET_INCOME: 0,
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-4 h-4 text-gray-400" />
        <h3 className="font-semibold text-gray-900 text-[13px]">Financial Goals — {year}</h3>
        <span className="ml-auto text-[10px] text-gray-400">Click any goal to edit</span>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {GOAL_TYPES.map(({ type, label, color, textColor, borderColor, bgColor }) => {
          const target = goals[type] ?? 0
          const actual = actuals[type] ?? 0
          const pct = target > 0 ? Math.min(Math.round((actual / target) * 100), 100) : 0
          const monthly = target > 0 ? target / 12 : 0

          return (
            <div key={type} className={`rounded-xl border ${borderColor} ${bgColor} p-3`}>
              <p className={`text-[11px] font-semibold uppercase tracking-wide ${textColor} mb-2`}>{label}</p>

              {editing === type ? (
                <div className="mb-2">
                  <div className="flex gap-1">
                    <span className={`text-sm font-medium ${textColor}`}>$</span>
                    <input
                      autoFocus
                      value={inputVal}
                      onChange={(e) => setInputVal(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') save(type); if (e.key === 'Escape') { setEditing(null); setInputVal('') } }}
                      placeholder="e.g. 500000"
                      className="flex-1 bg-white border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </div>
                  <div className="flex gap-1.5 mt-1.5">
                    <button onClick={() => save(type)} disabled={saving} className={`flex-1 text-xs text-white py-1 rounded ${saving ? 'bg-gray-400' : `${color} hover:opacity-90`} transition-colors`}>
                      {saving ? '…' : 'Save'}
                    </button>
                    <button onClick={() => { setEditing(null); setInputVal('') }} className="flex-1 text-xs bg-white border border-gray-200 text-gray-500 py-1 rounded hover:bg-gray-50 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setEditing(type); setInputVal(target > 0 ? String(target) : '') }}
                  className="w-full text-left mb-2 group"
                >
                  <p className={`text-xl font-extrabold ${textColor} group-hover:opacity-70 transition-opacity`}>
                    {target > 0 ? `$${target >= 1000 ? `${(target / 1000).toFixed(0)}K` : target}` : <span className="text-sm font-medium opacity-60">Set goal →</span>}
                  </p>
                  {monthly > 0 && (
                    <p className={`text-[10px] ${textColor} opacity-60`}>
                      ${monthly >= 1000 ? `${(monthly / 1000).toFixed(0)}K` : monthly.toFixed(0)}/mo
                    </p>
                  )}
                </button>
              )}

              {target > 0 && (
                <>
                  <div className="h-1.5 bg-white/60 rounded-full overflow-hidden mb-1">
                    <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className={`flex justify-between text-[9px] ${textColor} opacity-60`}>
                    <span>${actual >= 1000 ? `${(actual / 1000).toFixed(0)}K` : actual} actual</span>
                    <span>{pct}%</span>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
