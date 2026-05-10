import { create } from 'zustand'

export interface Track {
  id: number
  file_path: string
  title: string | null
  artist: string | null
  album: string | null
  bpm: number | null
  key: string | null
  camelot_key: string | null
  energy: number | null
  danceability: number | null
  emotion: string | null
  genre: string | null
  sub_genre: string | null
  duration_ms: number | null
  sample_rate: number | null
  bitrate: number | null
  file_size_bytes: number | null
  cover_art_path: string | null
  analyzed_at: string | null
  created_at: string
}

interface AnalysisState {
  isAnalyzing: boolean
  analyzeProgress: number
  analyzeTotal: number
  analyzeProcessed: number
  analyzeStatus: string
}

interface TrackState extends AnalysisState {
  tracks: Track[]
  totalTracks: number
  isScanning: boolean
  scanProgress: number
  scanPath: string | null
  selectedTrackId: number | null
  selectedTrackIds: Set<number>
  searchQuery: string
  setTracks: (tracks: Track[], total: number) => void
  addTracks: (tracks: Track[]) => void
  setScanning: (scanning: boolean, path?: string) => void
  setScanProgress: (progress: number) => void
  setSelectedTrack: (id: number | null) => void
  toggleTrackSelection: (id: number) => void
  selectTrackRange: (fromId: number, toId: number, tracks: Track[]) => void
  clearSelection: () => void
  setSearchQuery: (query: string) => void
  updateTrack: (id: number, updates: Partial<Track>) => void
  clearTracks: () => void
  setAnalyzing: (analyzing: boolean) => void
  setAnalyzeProgress: (processed: number, total: number, status?: string) => void
}

export const useTrackStore = create<TrackState>((set) => ({
  tracks: [],
  totalTracks: 0,
  isScanning: false,
  scanProgress: 0,
  scanPath: null,
  selectedTrackId: null,
  selectedTrackIds: new Set<number>(),
  searchQuery: '',
  isAnalyzing: false,
  analyzeProgress: 0,
  analyzeTotal: 0,
  analyzeProcessed: 0,
  analyzeStatus: '',
  setTracks: (tracks, total) => set({ tracks, totalTracks: total }),
  addTracks: (tracks) => set((state) => ({ 
    tracks: [...tracks, ...state.tracks],
    totalTracks: state.totalTracks + tracks.length 
  })),
  setScanning: (scanning, path) => set({ 
    isScanning: scanning, 
    scanPath: path || null,
    scanProgress: scanning ? 0 : 100 
  }),
  setScanProgress: (progress) => set({ scanProgress: progress }),
  setSelectedTrack: (id) => set({ selectedTrackId: id, selectedTrackIds: new Set(id !== null ? [id] : []) }),
  toggleTrackSelection: (id: number) => set((state) => {
    const next = new Set(state.selectedTrackIds)
    if (next.has(id)) {
      next.delete(id)
      return { selectedTrackIds: next, selectedTrackId: next.size > 0 ? Array.from(next)[next.size - 1] : null }
    } else {
      next.add(id)
      return { selectedTrackIds: next, selectedTrackId: id }
    }
  }),
  selectTrackRange: (fromId: number, toId: number, tracks: Track[]) => set((state) => {
    const fromIdx = tracks.findIndex(t => t.id === fromId)
    const toIdx = tracks.findIndex(t => t.id === toId)
    if (fromIdx === -1 || toIdx === -1) return state
    const start = Math.min(fromIdx, toIdx)
    const end = Math.max(fromIdx, toIdx)
    const next = new Set(state.selectedTrackIds)
    for (let i = start; i <= end; i++) {
      next.add(tracks[i].id)
    }
    return { selectedTrackIds: next, selectedTrackId: toId }
  }),
  clearSelection: () => set({ selectedTrackIds: new Set(), selectedTrackId: null }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  updateTrack: (id: number, updates: Partial<Track>) => set((state) => ({
    tracks: state.tracks.map((t) => t.id === id ? { ...t, ...updates } : t),
  })),
  clearTracks: () => set({ tracks: [], totalTracks: 0, scanProgress: 0 }),
  setAnalyzing: (analyzing) => set({ 
    isAnalyzing: analyzing, 
    analyzeProgress: analyzing ? 0 : 100,
    analyzeProcessed: 0,
    analyzeStatus: analyzing ? 'Starting analysis...' : '' 
  }),
  setAnalyzeProgress: (processed, total, status) => set({ 
    analyzeProcessed: processed,
    analyzeTotal: total,
    analyzeProgress: total > 0 ? (processed / total) * 100 : 0,
    analyzeStatus: status || `${processed}/${total} tracks analyzed`,
  }),
}))
