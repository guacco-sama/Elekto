import { create } from 'zustand'

export interface Chapter {
  id: number
  name: string
  description: string | null
  energy_target: number | null
  sort_order: number
  created_at: string
}

export interface ChapterTrack {
  chapter_id: number
  track_id: number
  position: number
  transition_notes: string | null
}

interface ChapterState {
  chapters: Chapter[]
  selectedChapterId: number | null
  chapterTracks: Map<number, number[]> // chapter_id -> ordered track_ids
  isLoading: boolean
  setChapters: (chapters: Chapter[]) => void
  selectChapter: (id: number | null) => void
  addChapter: (chapter: Chapter) => void
  removeChapter: (id: number) => void
  setChapterTracks: (chapterId: number, trackIds: number[]) => void
  addTrackToChapter: (chapterId: number, trackId: number) => void
  removeTrackFromChapter: (chapterId: number, trackId: number) => void
  reorderTracks: (chapterId: number, trackIds: number[]) => void
  setLoading: (loading: boolean) => void
}

export const useChapterStore = create<ChapterState>((set, get) => ({
  chapters: [],
  selectedChapterId: null,
  chapterTracks: new Map(),
  isLoading: false,

  setChapters: (chapters) => set({ chapters }),

  selectChapter: (id) => set({ selectedChapterId: id }),

  addChapter: (chapter) =>
    set((state) => ({
      chapters: [...state.chapters, chapter].sort((a, b) => a.sort_order - b.sort_order),
    })),

  removeChapter: (id) =>
    set((state) => {
      const next = new Map(state.chapterTracks)
      next.delete(id)
      return {
        chapters: state.chapters.filter((c) => c.id !== id),
        chapterTracks: next,
        selectedChapterId: state.selectedChapterId === id ? null : state.selectedChapterId,
      }
    }),

  setChapterTracks: (chapterId, trackIds) =>
    set((state) => {
      const next = new Map(state.chapterTracks)
      next.set(chapterId, trackIds)
      return { chapterTracks: next }
    }),

  addTrackToChapter: (chapterId, trackId) =>
    set((state) => {
      const next = new Map(state.chapterTracks)
      const existing = next.get(chapterId) || []
      if (!existing.includes(trackId)) {
        next.set(chapterId, [...existing, trackId])
      }
      return { chapterTracks: next }
    }),

  removeTrackFromChapter: (chapterId, trackId) =>
    set((state) => {
      const next = new Map(state.chapterTracks)
      const existing = next.get(chapterId) || []
      next.set(
        chapterId,
        existing.filter((id) => id !== trackId)
      )
      return { chapterTracks: next }
    }),

  reorderTracks: (chapterId, trackIds) =>
    set((state) => {
      const next = new Map(state.chapterTracks)
      next.set(chapterId, trackIds)
      return { chapterTracks: next }
    }),

  setLoading: (loading) => set({ isLoading: loading }),
}))
