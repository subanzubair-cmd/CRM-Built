'use client'

/**
 * CallRecordingPlayer — inline `<audio>` player for a recorded call.
 *
 * Lazily fetches a short-lived presigned MinIO URL from
 * /api/calls/[id]/recording on first interaction. Avoids signing
 * URLs for every row at SSR time (presigned URLs expire fast).
 *
 * The recording is served from CRM-owned MinIO, never from the provider.
 */

import { useState, useRef } from 'react'
import { Play, Pause, Loader2, AlertCircle } from 'lucide-react'

interface Props {
  callId: string
}

export function CallRecordingPlayer({ callId }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)

  async function handleToggle() {
    setError(null)
    if (playing) {
      audioRef.current?.pause()
      setPlaying(false)
      return
    }

    if (!src) {
      setLoading(true)
      try {
        const res = await fetch(`/api/calls/${callId}/recording`)
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(json.error ?? 'Failed to load recording')
        }
        const { url } = await res.json()
        setSrc(url)
        // wait a tick for state to flush before playing
        setTimeout(() => audioRef.current?.play().catch(() => {}), 0)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
        setLoading(false)
        return
      } finally {
        setLoading(false)
      }
    } else {
      audioRef.current?.play().catch(() => {})
    }
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        onClick={handleToggle}
        disabled={loading}
        className="inline-flex items-center gap-1 text-[11px] bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded-full transition-colors disabled:opacity-50"
        title={playing ? 'Pause recording' : 'Play recording'}
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : playing ? (
          <Pause className="w-3 h-3" />
        ) : (
          <Play className="w-3 h-3" />
        )}
        {playing ? 'Pause' : 'Play'}
      </button>
      {error && (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-red-600" title={error}>
          <AlertCircle className="w-3 h-3" />
        </span>
      )}
      {src && (
        <audio
          ref={audioRef}
          src={src}
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => setError('Playback failed')}
        />
      )}
    </div>
  )
}
