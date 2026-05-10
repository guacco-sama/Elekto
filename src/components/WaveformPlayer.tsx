import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { AudioEngine } from '../audio/AudioEngine'

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

interface CuePoint {
  time_sec: number
  cue_type: string
  confidence: number
  energy: number
}

interface WaveformPlayerProps {
  trackId: number
  trackTitle: string
  trackArtist: string
  filePath: string
  sendCommandAsync: (cmd: Record<string, unknown>) => Promise<Record<string, unknown>>
}

export default function WaveformPlayer({
  trackId,
  trackTitle,
  trackArtist,
  filePath,
  sendCommandAsync,
}: WaveformPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [waveform, setWaveform] = useState<WaveformData | null>(null)
  const [beatGrid, setBeatGrid] = useState<BeatGrid | null>(null)
  const [cues, setCues] = useState<CuePoint[]>([])
  const [loadingWaveform, setLoadingWaveform] = useState(true)
  const [audioState, setAudioState] = useState<'idle' | 'loading' | 'playing' | 'paused'>('idle')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.8)
  const playheadRef = useRef(0)

  const audioRef = useRef<AudioEngine | null>(null)

  // Initialize AudioEngine once
  useEffect(() => {
    const engine = new AudioEngine({
      onTimeUpdate: (time, dur) => {
        playheadRef.current = dur > 0 ? time / dur : 0
        setCurrentTime(time)
        setDuration(dur)
      },
      onEnded: () => {
        setAudioState('idle')
        playheadRef.current = 0
        setCurrentTime(0)
      },
      onError: (err) => {
        console.error('Audio error:', err)
        setAudioState('idle')
      },
      onStateChange: (state) => setAudioState(state),
    })
    audioRef.current = engine
    return () => {
      engine.dispose()
      audioRef.current = null
    }
  }, [])

  // Fetch waveform + beat-grid from worker
  useEffect(() => {
    let cancelled = false
    setLoadingWaveform(true)

    const fetch = async () => {
      try {
        const response = await sendCommandAsync({
          type: 'get_waveform',
          track_id: trackId,
          pixel_width: 1200,
        }) as { type: string; track_id: number; waveform_json: string; beatgrid_json: string; cues_json: string }

        if (response.type === 'waveform_data') {
          const wf: WaveformData = JSON.parse(response.waveform_json as string)
          const bg: BeatGrid = JSON.parse(response.beatgrid_json as string)
          const cuePoints: CuePoint[] = JSON.parse((response.cues_json as string) || '[]')
          if (!cancelled) {
            setWaveform(wf)
            setBeatGrid(bg)
            setCues(cuePoints)
            setDuration(wf.duration_sec)
          }
        }
      } catch (err) {
        console.error('Failed to load waveform:', err)
      } finally {
        if (!cancelled) setLoadingWaveform(false)
      }
    }

    fetch()
    return () => { cancelled = true }
  }, [trackId, sendCommandAsync])

  // Load audio file when track changes
  useEffect(() => {
    const engine = audioRef.current
    if (!engine || !filePath) return

    engine.loadFile(filePath).then(() => {
      const dur = engine.getDuration()
      if (dur > 0) {
        setDuration(dur)
      }
    })
  }, [filePath])

  // Sync playhead to visual state for drawing
  const [playhead, setPlayhead] = useState(0)
  useEffect(() => {
    if (!waveform || duration <= 0) return
    setPlayhead(currentTime / duration)
  }, [currentTime, duration, waveform])

  // Draw waveform with animation loop
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

    // Darken played portion
    const phX = playhead * w
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
    ctx.fillRect(phX, 0, w - phX, h)

    // Draw beat markers
    if (beatGrid && beatGrid.beat_times.length > 0) {
      const dur = waveform.duration_sec
      ctx.lineWidth = 1

      beatGrid.beat_times.forEach((time, idx) => {
        const x = (time / dur) * w
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

    // Draw cue markers
    const cueColors: Record<string, string> = {
      intro: '#33ff66',
      drop: '#ff3333',
      breakdown: '#ffaa00',
      buildup: '#00ccff',
      outro: '#8888ff',
      energy_peak: '#ff6600',
      energy_valley: '#9966ff',
    }

    cues.forEach((cue) => {
      const x = (cue.time_sec / waveform.duration_sec) * w
      const color = cueColors[cue.cue_type] || '#aaaaaa'
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()

      // Label
      ctx.fillStyle = color
      ctx.font = 'bold 10px Inter, sans-serif'
      const label = cue.cue_type.replace('_', ' ').toUpperCase()
      ctx.fillText(label, x + 3, 14)
    })

    // Draw playhead
    ctx.strokeStyle = '#e8e8f8'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(phX, 0)
    ctx.lineTo(phX, h)
    ctx.stroke()

    // Time display near playhead
    ctx.fillStyle = '#e8e8f8'
    ctx.font = '11px JetBrains Mono, monospace'
    const time = formatTime(currentTime)
    const durText = formatTime(duration)
    ctx.fillText(`${time} / ${durText}`, phX + 6, 16)
  }, [waveform, beatGrid, cues, playhead, currentTime, duration])

  // Animation frame for smooth waveform redraw
  useEffect(() => {
    let animId = 0
    const loop = () => {
      draw()
      animId = requestAnimationFrame(loop)
    }
    animId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animId)
  }, [draw])

  // Click to seek
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || !waveform) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = Math.max(0, Math.min(1, x / rect.width))
    const time = pct * waveform.duration_sec
    audioRef.current?.seek(time)
  }, [waveform])

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    const engine = audioRef.current
    if (!engine) return

    if (engine.playing) {
      engine.pause()
    } else {
      engine.play()
    }
  }, [])

  // Stop
  const handleStop = useCallback(() => {
    audioRef.current?.stop()
  }, [])

  // Volume change
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value)
    setVolume(vol)
    audioRef.current?.setVolume(vol)
  }, [])

  const formatTime = (sec: number): string => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    const ms = Math.floor((sec % 1) * 10)
    return `${m}:${s.toString().padStart(2, '0')}.${ms}`
  }

  if (loadingWaveform) {
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

  const isReady = audioState !== 'loading'

  return (
    <div className="space-y-2">
      {/* Track info + controls */}
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-dj-100 truncate">{trackTitle || 'Unknown'}</p>
          <p className="text-xs text-dj-500 truncate">{trackArtist || 'Unknown Artist'}</p>
        </div>
        <div className="flex items-center gap-4">
          {beatGrid && (
            <span className="text-xs text-dj-400 font-mono">
              {beatGrid.bpm.toFixed(1)} BPM
            </span>
          )}
          {/* Volume */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-dj-500">Vol</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={handleVolumeChange}
              className="w-20 h-1 bg-dj-700 rounded-lg appearance-none cursor-pointer accent-dj-accent"
            />
          </div>
          {/* Play controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleStop}
              disabled={!isReady}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-xs bg-dj-800 text-dj-400 hover:bg-dj-700 disabled:opacity-40 transition-colors"
              title="Stop"
            >
              ◼
            </button>
            <button
              onClick={togglePlay}
              disabled={!isReady}
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-colors ${
                audioState === 'playing'
                  ? 'bg-dj-accent text-white'
                  : 'bg-dj-800 text-dj-300 hover:bg-dj-700 disabled:opacity-40'
              }`}
              title={audioState === 'playing' ? 'Pause' : 'Play'}
            >
              {audioState === 'loading' ? '○' : audioState === 'playing' ? '⏸' : '▶'}
            </button>
          </div>
        </div>
      </div>

      {/* Waveform canvas */}
      <div ref={containerRef} className="w-full cursor-pointer relative">
        <canvas
          ref={canvasRef}
          onClick={handleClick}
          className="w-full rounded-lg border border-dj-800"
        />
      </div>

      {/* Bottom info bar */}
      <div className="flex items-center justify-between text-xs text-dj-500">
        <div className="flex items-center gap-4">
          {beatGrid && (
            <>
              <span>Downbeats: {beatGrid.downbeat_indices.length}</span>
              <span>Beats: {beatGrid.beat_times.length}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          {cues.length > 0 && (
            <span>{cues.length} cues detected</span>
          )}
          <span className="font-mono">{formatTime(currentTime)} / {formatTime(duration)}</span>
        </div>
      </div>

      {/* Cue badges */}
      {cues.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <span className="text-xs text-dj-500">Cues:</span>
          {cues.map((cue, i) => {
            const colors: Record<string, string> = {
              intro: 'bg-green-400/20 text-green-400',
              drop: 'bg-red-400/20 text-red-400',
              breakdown: 'bg-orange-400/20 text-orange-400',
              buildup: 'bg-cyan-400/20 text-cyan-400',
              outro: 'bg-violet-400/20 text-violet-400',
              energy_peak: 'bg-amber-400/20 text-amber-400',
              energy_valley: 'bg-purple-400/20 text-purple-400',
            }
            return (
              <button
                key={i}
                onClick={() => audioRef.current?.seek(cue.time_sec)}
                className={`text-xs px-2 py-0.5 rounded cursor-pointer hover:opacity-80 transition-opacity ${colors[cue.cue_type] || 'bg-dj-800 text-dj-400'}`}
                title={`Jump to ${cue.cue_type}`}
              >
                {cue.cue_type.replace('_', ' ')} @ {Math.round(cue.time_sec)}s
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
