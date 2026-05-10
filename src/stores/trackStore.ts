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

interface TrackState {
  tracks: Track[]
  totalTracks: number
  isScanning: boolean
  scanProgress: number
  scanPath: string | null
  selectedTrackId: number | null
  searchQuery: string
  setTracks: (tracks: Track[], total: number) => void
  addTracks: (tracks: Track[]) => void
  setScanning: (scanning: boolean, path?: string) => void
  setScanProgress: (progress: number) => void
  setSelectedTrack: (id: number | null) => void
  setSearchQuery: (query: string) => void
  updateTrack: (id: number, updates: Partial<Track>) => void
  clearTracks: () => void
}

export const useTrackStore = create<TrackState>((set) => ({
  tracks: [],
  totalTracks: 0,
  isScanning: false,
  scanProgress: 0,
  scanPath: null,
  selectedTrackId: null,
  searchQuery: '',
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
  setSelectedTrack: (id) => set({ selectedTrackId: id }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  updateTrack: (id: number, updates: Partial<Track>) => set((state) => ({
    tracks: state.tracks.map((t) => t.id === id ? { ...t, ...updates } : t),
  })),
  clearTracks: () => set({ tracks: [], totalTracks: 0, scanProgress: 0 }),
}))
