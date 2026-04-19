'use client'

import { useEffect, useState, useCallback } from 'react'
import { Phone, Mic, MicOff, PhoneOff, RefreshCw } from 'lucide-react'

interface ActiveCall {
  id: string
  conferenceName: string
  conferenceId: string | null
  status: string
  supervisorMode: string | null
  customerPhone: string | null
  startedAt: string
  agent: { id: string; name: string; phone: string | null } | null
  property: { id: string; streetAddress: string; city: string | null; propertyStatus: string } | null
}

function elapsedSince(dateStr: string): string {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ${secs % 60}s`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    INITIATING: 'bg-yellow-100 text-yellow-700',
    RINGING: 'bg-blue-100 text-blue-700',
    ACTIVE: 'bg-green-100 text-green-700',
    COMPLETED: 'bg-gray-100 text-gray-500',
  }
  return map[status] ?? 'bg-gray-100 text-gray-500'
}

export function ActiveCallsPanel() {
  const [calls, setCalls] = useState<ActiveCall[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0) // ticks to force re-render for timer

  const fetchCalls = useCallback(async () => {
    try {
      const res = await fetch('/api/calls')
      if (!res.ok) throw new Error('Failed to fetch calls')
      const json = await res.json()
      setCalls(json.data ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading calls')
    } finally {
      setLoading(false)
    }
  }, [])

  // Poll every 5 seconds
  useEffect(() => {
    fetchCalls()
    const interval = setInterval(fetchCalls, 5000)
    return () => clearInterval(interval)
  }, [fetchCalls])

  // Tick every second to update elapsed timers
  useEffect(() => {
    const tick = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(tick)
  }, [])

  async function joinCall(callId: string, mode: 'WHISPER' | 'BARGE') {
    setActing(callId)
    setError(null)
    try {
      const res = await fetch(`/api/calls/${callId}/coach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to join call')
      await fetchCalls()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error joining call')
    } finally {
      setActing(null)
    }
  }

  async function hangup(callId: string) {
    if (!confirm('End this call for all parties?')) return
    setActing(callId)
    setError(null)
    try {
      const res = await fetch(`/api/calls/${callId}/hangup`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to end call')
      setCalls((prev) => prev.filter((c) => c.id !== callId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error ending call')
    } finally {
      setActing(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-8">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Loading active calls…
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-green-600" />
          <span className="text-sm font-semibold text-gray-800">
            Active Calls ({calls.length})
          </span>
          <span className="text-xs text-gray-400">— refreshes every 5s</span>
        </div>
        <button
          onClick={fetchCalls}
          className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 mb-3 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      {calls.length === 0 ? (
        <div className="text-sm text-gray-500 bg-gray-50 rounded-xl px-5 py-8 text-center">
          No active calls right now.
          <br />
          <span className="text-xs text-gray-400 mt-1 block">
            Calls appear here when agents initiate outbound conference calls.
          </span>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                <th className="px-4 py-2.5 text-left">Agent</th>
                <th className="px-4 py-2.5 text-left">Customer</th>
                <th className="px-4 py-2.5 text-left">Property</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-left">Duration</th>
                <th className="px-4 py-2.5 text-left">Supervisor</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <tr key={call.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900 font-medium">
                    {call.agent?.name ?? '—'}
                    {call.agent?.phone && (
                      <span className="block text-xs text-gray-400 font-mono">{call.agent.phone}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">
                    {call.customerPhone ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {call.property
                      ? `${call.property.streetAddress}${call.property.city ? `, ${call.property.city}` : ''}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusBadge(call.status)}`}>
                      {call.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 tabular-nums">
                    {elapsedSince(call.startedAt)}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {call.supervisorMode ? (
                      <span className={`font-semibold ${call.supervisorMode === 'WHISPER' ? 'text-purple-700' : 'text-orange-700'}`}>
                        {call.supervisorMode}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      {/* Whisper: only show if not already coaching */}
                      {call.status === 'ACTIVE' && !call.supervisorMode && (
                        <>
                          <button
                            onClick={() => joinCall(call.id, 'WHISPER')}
                            disabled={acting === call.id || !call.conferenceId}
                            title="Whisper (speak to agent only)"
                            className="flex items-center gap-1 text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 px-2.5 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
                          >
                            <Mic className="w-3.5 h-3.5" />
                            Whisper
                          </button>
                          <button
                            onClick={() => joinCall(call.id, 'BARGE')}
                            disabled={acting === call.id || !call.conferenceId}
                            title="Barge (all parties hear each other)"
                            className="flex items-center gap-1 text-xs bg-orange-50 hover:bg-orange-100 text-orange-700 px-2.5 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
                          >
                            <MicOff className="w-3.5 h-3.5" />
                            Barge
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => hangup(call.id)}
                        disabled={acting === call.id}
                        title="End call"
                        className="flex items-center gap-1 text-xs bg-red-50 hover:bg-red-100 text-red-700 px-2.5 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
                      >
                        <PhoneOff className="w-3.5 h-3.5" />
                        End
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-4 text-xs text-gray-400 space-y-1">
        <p><strong className="text-gray-500">Whisper:</strong> You hear the agent + customer. Only the agent hears you. Customer is unaware.</p>
        <p><strong className="text-gray-500">Barge:</strong> All three parties hear each other.</p>
        <p><strong className="text-gray-500">Requirement:</strong> Your user profile must have a phone number set (Settings → Profile) to join calls.</p>
      </div>
    </div>
  )
}
