import { useEffect, useRef, useCallback, useState } from 'react'

interface WaveformData {
  peaks: number[]
  rms: number[]
  duration_sec: number
  buckets: number
}

interface BeatGrid {
  beat_times: number[]
  downbeat_indices: number[]
  phase_offset: number
  bpm: number
  confidence: number
}

interface WaveformPlayerProps {
  trackId: number
  trackTitle: string
  trackArtist: string
  sendCommandAsync: (cmd: Record<string, unknown>) => Promise<Record<string, unknown>>
}

export default function WaveformPlayer({
  trackId,
  trackTitle,
  trackArtist,
  sendCommandAsync,
}: WaveformPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [waveform, setWaveform] = useState<WaveformData | null>(null)
  const [beatGrid, setBeatGrid] = useState<BeatGrid | null>(null)
  const [loading, setLoading] = useState(true)
  const [playhead, setPlayhead] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const animRef = useRef<number>(0)

  // Fetch waveform + beat-grid
  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const fetch = async () => {
      try {
        const response = await sendCommandAsync({
          type: 'get_waveform',
          track_id: trackId,
          pixel_width: 1200,
        }) as { type: string; track_id: number; waveform_json: string; beatgrid_json: string }

        if (response.type === 'waveform_data') {
          const wf: WaveformData = JSON.parse(response.waveform_json as string)
          const bg: BeatGrid = JSON.parse(response.beatgrid_json as string)
          if (!cancelled) {
            setWaveform(wf)
            setBeatGrid(bg)
            setLoading(false)
          }
        }
      } catch (err) {
        console.error('Failed to load waveform:', err)
        if (!cancelled) setLoading(false)
      }
    }

    fetch()
    return () => { cancelled = true }
  }, [trackId, sendCommandAsync])

  // Draw waveform
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || !waveform) return

    const dpr = Math.min(window.devicePixelRatio, 2)
    const w = container.clientWidth
    const h = 120
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    // Background
    ctx.fillStyle = '#12121a'
    ctx.fillRect(0, 0, w, h)

    const peaks = waveform.peaks
    const buckets = peaks.length
    const barWidth = Math.max(1, w / buckets)
    const halfH = h / 2
    const padding = 2

    // Draw waveform bars
    for (let i = 0; i < buckets; i++) {
      const x = i * barWidth
      const peak = peaks[i]
      const barH = peak * halfH * 0.9

      // Color by intensity
      const intensity = Math.min(peak, 1.0)
      const r = Math.round(124 + intensity * 100)
      const g = Math.round(58 + intensity * 80)
      const b = Math.round(237 - intensity * 50)
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`

      // Top half
      ctx.fillRect(x, halfH - barH, barWidth - padding, barH)
      // Bottom half (mirror)
      ctx.fillRect(x, halfH, barWidth - padding, barH)
    }

    // Draw beat markers
    if (beatGrid && beatGrid.beat_times.length > 0) {
      const duration = waveform.duration_sec
      ctx.lineWidth = 1

      beatGrid.beat_times.forEach((time, idx) => {
        const x = (time / duration) * w
        const isDownbeat = beatGrid.downbeat_indices.includes(idx)

        if (isDownbeat) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
          ctx.beginPath()
          ctx.moveTo(x, 0)
          ctx.lineTo(x, h)
          ctx.stroke()
        } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
          ctx.beginPath()
          ctx.moveTo(x, halfH - 10)
          ctx.lineTo(x, halfH + 10)
          ctx.stroke()
        }
      })
    }

    // Draw playhead
    const phX = playhead * w
    ctx.strokeStyle = '#e8e8f8'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(phX, 0)
    ctx.lineTo(phX, h)
    ctx.stroke()

    // Time display
    ctx.fillStyle = '#e8e8f8'
    ctx.font = '11px JetBrains Mono, monospace'
    const time = (playhead * waveform.duration_sec).toFixed(1)
    ctx.fillText(`${time}s`, phX + 6, 16)
  }, [waveform, beatGrid, playhead])

  useEffect(() => {
    draw()
  }, [draw])

  // Playback simulation
  useEffect(() => {
    if (!isPlaying || !waveform) return

    let last = performance.now()
    const duration = waveform.duration_sec

    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      setPlayhead((p) => {
        const next = p + dt / duration
        return next >= 1 ? 0 : next
      })
      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [isPlaying, waveform])

  // Click to seek
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = x / rect.width
    setPlayhead(Math.max(0, Math.min(1, pct)))
  }

  if (loading) {
    return (
      <div className="h-32 flex items-center justify-center text-dj-500 text-sm">
        Generating waveform...
      </div>
    )
  }

  if (!waveform) {
    return (
      <div className="h-32 flex items-center justify-center text-dj-500 text-sm">
        Waveform unavailable
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Track info */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-dj-100">{trackTitle || 'Unknown'}</p>
          <p className="text-xs text-dj-500">{trackArtist || 'Unknown Artist'}</p>
        </div>
        <div className="flex items-center gap-3">
          {beatGrid && (
            <span className="text-xs text-dj-400 font-mono">
              {beatGrid.bpm.toFixed(1)} BPM · {beatGrid.beat_times.length} beats
            </span>
          )}
          <button
            onClick={() => setIsPlaying((p) => !p)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-colors ${
              isPlaying
                ? 'bg-dj-accent text-white'
                : 'bg-dj-800 text-dj-300 hover:bg-dj-700'
            }`}
          >
            {isPlaying ? 'II' : '▶'}
          </button>
        </div>
      </div>

      {/* Waveform */}
      <div ref={containerRef} className="w-full cursor-pointer">
        <canvas
          ref={canvasRef}
          onClick={handleClick}
          className="w-full rounded-lg border border-dj-800"
        />
      </div>

      {/* Beat info */}
      {beatGrid && (
        <div className="flex items-center gap-4 text-xs text-dj-500">
          <span>Downbeats: {beatGrid.downbeat_indices.length}</span>
          <span>Confidence: {Math.round(beatGrid.confidence * 100)}%</span>
          <span>Phase: {beatGrid.phase_offset}</span>
        </div>
      )}
    </div>
  )
}
