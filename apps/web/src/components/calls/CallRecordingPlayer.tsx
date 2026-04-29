'use client'

/**
 * CallRecordingPlayer — compact, self-contained transport for a
 * recorded call.
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ ▶  0:00  ●━━━━━━━━━━━━━━━━━━━  44:46  ⬇  1×            │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Designed to fit inside narrow row containers: width is `w-full` so
 * the host row's `min-w-0 overflow-hidden` clamps it; the slider grows
 * to fill remaining space (`min-w-0 flex-1`). The transport collapses
 * gracefully on small widths because every sibling is `flex-shrink-0`
 * and the slider is the only flex-grower.
 *
 * Lazily fetches a presigned MinIO URL on first interaction to avoid
 * spending S3 sigs on offscreen rows.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause, Loader2, AlertCircle, Download } from 'lucide-react'

interface Props {
  callId: string
}

interface RecordingMeta {
  url: string
  durationSec: number | null
  expiresInSeconds: number
}

const SPEEDS = [0.5, 1, 1.25, 1.5, 2] as const

function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  const total = Math.floor(s)
  const hh = Math.floor(total / 3600)
  const mm = Math.floor((total % 3600) / 60)
  const ss = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  if (hh > 0) return `${hh}:${pad(mm)}:${pad(ss)}`
  return `${mm}:${pad(ss)}`
}

export function CallRecordingPlayer({ callId }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [meta, setMeta] = useState<RecordingMeta | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState<number>(0)
  const [speed, setSpeed] = useState<number>(1)
  const [seeking, setSeeking] = useState(false)

  const ensureLoaded = useCallback(async (): Promise<RecordingMeta | null> => {
    if (meta) return meta
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/calls/${callId}/recording`)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Failed to load recording')
      }
      const data: RecordingMeta = await res.json()
      setMeta(data)
      if (data.durationSec) setDuration(data.durationSec)
      return data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
      return null
    } finally {
      setLoading(false)
    }
  }, [callId, meta])

  async function handleToggle() {
    const audio = audioRef.current
    if (playing && audio) {
      audio.pause()
      return
    }
    const data = meta ?? (await ensureLoaded())
    if (!data) return
    setTimeout(
      () =>
        audioRef.current?.play().catch((err) =>
          setError(err.message ?? 'Playback failed'),
        ),
      0,
    )
  }

  async function handleDownload() {
    // True download — no new tab, no native audio preview. We fetch
    // the presigned URL as a blob and trigger a save via an in-page
    // anchor with `download`. Going through a Blob URL is the only
    // way `download` works for cross-origin presigned URLs (S3 /
    // MinIO); a direct `<a download href={presigned}>` would just
    // open in the same tab because the attribute is ignored on
    // cross-origin requests.
    const data = meta ?? (await ensureLoaded())
    if (!data) return
    try {
      const res = await fetch(data.url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `call-${callId}.${ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Revoke shortly after — Chrome occasionally prompts again on
      // immediate revoke; one tick is enough.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    }
  }

  function handleSeekChange(e: React.ChangeEvent<HTMLInputElement>) {
    setCurrentTime(Number(e.target.value))
  }

  function handleSeekCommit() {
    const audio = audioRef.current
    if (audio) {
      try {
        audio.currentTime = currentTime
      } catch {
        /* ignore — Infinity-duration WebMs sometimes throw */
      }
    }
    setSeeking(false)
  }

  function handleSpeedChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = Number(e.target.value)
    setSpeed(next)
    if (audioRef.current) audioRef.current.playbackRate = next
  }

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed
  }, [speed, meta])

  function commitDurationFromAudio() {
    const audio = audioRef.current
    if (!audio) return
    const native = audio.duration
    if (Number.isFinite(native) && native > 0) setDuration(native)
  }

  const total = duration > 0 ? duration : 0
  const progress = total > 0 ? Math.min(currentTime, total) : 0
  const hasError = !!error

  return (
    <div className="w-full inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-md px-1.5 py-1 max-w-full">
      {/* Play / Pause — icon-only to save horizontal space. */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={loading}
        className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
        title={playing ? 'Pause' : 'Play'}
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : playing ? (
          <Pause className="w-3 h-3" fill="currentColor" />
        ) : (
          <Play className="w-3 h-3 ml-[1px]" fill="currentColor" />
        )}
      </button>

      {/* Current time. min-w sized for "0:00" / "1:23:45". */}
      <span className="text-[10.5px] font-mono tabular-nums text-gray-700 flex-shrink-0">
        {formatTime(progress)}
      </span>

      {/* Scrubber — flex-1 + min-w-0 lets it shrink in narrow rows. */}
      <input
        type="range"
        min={0}
        max={total || 1}
        step={0.1}
        value={progress}
        disabled={!meta || total === 0}
        onMouseDown={() => setSeeking(true)}
        onTouchStart={() => setSeeking(true)}
        onChange={handleSeekChange}
        onMouseUp={handleSeekCommit}
        onTouchEnd={handleSeekCommit}
        onKeyUp={handleSeekCommit}
        className="
          flex-1 min-w-0 h-[3px] appearance-none cursor-pointer rounded-full
          bg-gray-200 accent-teal-600
          disabled:cursor-not-allowed disabled:opacity-50
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-2.5
          [&::-webkit-slider-thumb]:h-2.5
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-teal-600
          [&::-webkit-slider-thumb]:shadow
          [&::-moz-range-thumb]:border-0
          [&::-moz-range-thumb]:w-2.5
          [&::-moz-range-thumb]:h-2.5
          [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-teal-600
        "
      />

      <span className="text-[10.5px] font-mono tabular-nums text-gray-500 flex-shrink-0">
        {formatTime(total)}
      </span>

      {/* Download — saves the audio file directly. We pull the
          presigned URL as a Blob and trigger a save via an in-page
          anchor; this is the only way to force a download on a
          cross-origin URL (the `download` attribute is ignored
          otherwise). Stays on the current tab — no new-tab preview. */}
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:opacity-50"
        title="Download recording"
      >
        <Download className="w-3 h-3" />
      </button>

      {/* Speed selector — minimal-chrome <select>. */}
      <select
        value={speed}
        onChange={handleSpeedChange}
        className="flex-shrink-0 text-[10.5px] font-medium text-gray-700 bg-transparent border-0 px-0.5 py-0 hover:text-gray-900 cursor-pointer focus:outline-none"
        title="Playback speed"
      >
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}×
          </option>
        ))}
      </select>

      {hasError && (
        <span
          className="flex-shrink-0 inline-flex items-center text-red-600"
          title={error ?? ''}
        >
          <AlertCircle className="w-3 h-3" />
        </span>
      )}

      {meta?.url && (
        <audio
          ref={audioRef}
          src={meta.url}
          preload="metadata"
          onLoadedMetadata={commitDurationFromAudio}
          onDurationChange={commitDurationFromAudio}
          onTimeUpdate={() => {
            if (seeking) return
            const audio = audioRef.current
            if (audio) setCurrentTime(audio.currentTime)
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => setError('Playback failed')}
        />
      )}
    </div>
  )
}
