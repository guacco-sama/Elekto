/**
 * AudioEngine - Real audio playback using Web Audio API
 *
 * Reads audio files via Electron IPC, decodes with AudioContext,
 * and provides play/pause/seek/stop controls with time callbacks.
 */

export interface AudioEngineCallbacks {
  onTimeUpdate?: (time: number, duration: number) => void
  onEnded?: () => void
  onError?: (err: Error) => void
  onStateChange?: (state: 'idle' | 'loading' | 'playing' | 'paused') => void
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private sourceNode: AudioBufferSourceNode | null = null
  private gainNode: GainNode | null = null
  private buffer: AudioBuffer | null = null
  private filePath: string = ''
  private startTime = 0
  private pausedAt = 0
  private isPlaying = false
  private isLoading = false
  private callbacks: AudioEngineCallbacks = {}
  private timeUpdateInterval: ReturnType<typeof setInterval> | null = null
  private fileCache = new Map<string, AudioBuffer>()

  constructor(callbacks?: AudioEngineCallbacks) {
    this.callbacks = callbacks || {}
  }

  private getAudioCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
    return this.ctx
  }

  /** Load and decode an audio file */
  async loadFile(filePath: string): Promise<void> {
    if (this.isLoading) return
    this.isLoading = true
    this.callbacks.onStateChange?.('loading')

    try {
      // Check cache
      if (this.fileCache.has(filePath)) {
        this.buffer = this.fileCache.get(filePath)!
        this.filePath = filePath
        this.isLoading = false
        this.callbacks.onStateChange?.('idle')
        return
      }

      if (!window.electronAPI?.audio) {
        throw new Error('Audio IPC not available')
      }

      const arrayBuffer = await window.electronAPI.audio.readAudioFile(filePath)
      const ctx = this.getAudioCtx()
      const decoded = await ctx.decodeAudioData(arrayBuffer)

      this.buffer = decoded
      this.filePath = filePath
      this.pausedAt = 0
      this.isPlaying = false

      // Cache decoded buffer
      this.fileCache.set(filePath, decoded)
      // Keep cache small
      if (this.fileCache.size > 10) {
        const first = this.fileCache.keys().next().value
        if (first) this.fileCache.delete(first)
      }

      this.callbacks.onStateChange?.('idle')
    } catch (err) {
      this.callbacks.onError?.(err as Error)
      this.callbacks.onStateChange?.('idle')
    } finally {
      this.isLoading = false
    }
  }

  /** Start or resume playback */
  play(): void {
    if (!this.buffer) return
    if (this.isPlaying) return

    const ctx = this.getAudioCtx()

    // Create source and gain nodes
    const source = ctx.createBufferSource()
    source.buffer = this.buffer

    const gain = ctx.createGain()
    gain.gain.value = 1.0

    source.connect(gain)
    gain.connect(ctx.destination)

    this.sourceNode = source
    this.gainNode = gain

    // Start from paused position
    const startOffset = this.pausedAt
    source.start(0, startOffset)
    this.startTime = ctx.currentTime - startOffset
    this.isPlaying = true

    this.callbacks.onStateChange?.('playing')

    // Time update loop
    this.timeUpdateInterval = setInterval(() => {
      if (!this.isPlaying) return
      const current = this.getCurrentTime()
      const duration = this.buffer?.duration || 0
      this.callbacks.onTimeUpdate?.(current, duration)

      if (current >= duration - 0.01) {
        this.stop()
        this.callbacks.onEnded?.()
      }
    }, 50) // 20fps update rate

    // When source ends naturally
    source.onended = () => {
      if (this.isPlaying) {
        this.stop()
        this.callbacks.onEnded?.()
      }
    }
  }

  /** Pause playback */
  pause(): void {
    if (!this.isPlaying || !this.ctx) return
    this.pausedAt = this.getCurrentTime()
    this.sourceNode?.stop()
    this.sourceNode = null
    this.isPlaying = false
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval)
      this.timeUpdateInterval = null
    }
    this.callbacks.onStateChange?.('paused')
  }

  /** Stop and reset to beginning */
  stop(): void {
    if (!this.isPlaying && this.pausedAt === 0) return
    this.sourceNode?.stop()
    this.sourceNode = null
    this.pausedAt = 0
    this.isPlaying = false
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval)
      this.timeUpdateInterval = null
    }
    this.callbacks.onStateChange?.('idle')
    if (this.buffer) {
      this.callbacks.onTimeUpdate?.(0, this.buffer.duration)
    }
  }

  /** Seek to time in seconds */
  seek(timeSec: number): void {
    if (!this.buffer) return
    const duration = this.buffer.duration
    const clamped = Math.max(0, Math.min(timeSec, duration))

    if (this.isPlaying) {
      this.pause()
      this.pausedAt = clamped
      this.play()
    } else {
      this.pausedAt = clamped
      this.callbacks.onTimeUpdate?.(clamped, duration)
    }
  }

  /** Set volume (0.0 to 1.0) */
  setVolume(vol: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, vol))
    }
  }

  /** Get current playback time */
  getCurrentTime(): number {
    if (!this.isPlaying || !this.ctx) return this.pausedAt
    return this.ctx.currentTime - this.startTime
  }

  /** Get total duration */
  getDuration(): number {
    return this.buffer?.duration || 0
  }

  /** Check if currently playing */
  get playing(): boolean {
    return this.isPlaying
  }

  /** Check if loading */
  get loading(): boolean {
    return this.isLoading
  }

  /** Clean up resources */
  dispose(): void {
    this.stop()
    this.fileCache.clear()
    this.buffer = null
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval)
    }
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close()
    }
  }
}
