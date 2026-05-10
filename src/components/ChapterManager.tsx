import { useState, useCallback, useEffect } from 'react'
import { useChapterStore } from '../stores/chapterStore'
import { useTrackStore } from '../stores/trackStore'
import { FolderPlus, Trash2, GripVertical, Music, ArrowRight, Sparkles, Zap, BarChart3 } from 'lucide-react'

interface ChapterManagerProps {
  sendCommandAsync: (cmd: Record<string, unknown>) => Promise<Record<string, unknown>>
}

export default function ChapterManager({ sendCommandAsync }: ChapterManagerProps) {
  const chapters = useChapterStore((s) => s.chapters)
  const selectedChapterId = useChapterStore((s) => s.selectedChapterId)
  const chapterTracks = useChapterStore((s) => s.chapterTracks)
  const addChapter = useChapterStore((s) => s.addChapter)
  const removeChapter = useChapterStore((s) => s.removeChapter)
  const selectChapter = useChapterStore((s) => s.selectChapter)
  const setChapterTracks = useChapterStore((s) => s.setChapterTracks)
  const addTrackToChapter = useChapterStore((s) => s.addTrackToChapter)
  const removeTrackFromChapter = useChapterStore((s) => s.removeTrackFromChapter)
  const reorderTracks = useChapterStore((s) => s.reorderTracks)

  const tracks = useTrackStore((s) => s.tracks)
  const selectedTrackId = useTrackStore((s) => s.selectedTrackId)

  const [newChapterName, setNewChapterName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [draggedTrack, setDraggedTrack] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [sortStrategy, setSortStrategy] = useState<'energy_flow' | 'harmonic' | 'bpm_ramp' | 'random'>('energy_flow')
  const [sorting, setSorting] = useState(false)

  // Load chapters on mount
  useEffect(() => {
    const load = async () => {
      try {
        const res = await sendCommandAsync({ type: 'get_chapters' }) as { type: string; chapters: Array<{ id: number; name: string; description: string | null; energy_target: number | null; sort_order: number; created_at: string }> }
        if (res.type === 'chapters') {
          useChapterStore.getState().setChapters(res.chapters)
        }
      } catch (e) {
        console.error('Failed to load chapters:', e)
      }
    }
    load()
  }, [sendCommandAsync])

  const handleCreateChapter = useCallback(async () => {
    if (!newChapterName.trim()) return
    try {
      const res = await sendCommandAsync({
        type: 'create_chapter',
        name: newChapterName.trim(),
        description: null,
        energy_target: null,
      }) as { type: string; chapter_id: number }
      if (res.type === 'chapter_created') {
        addChapter({
          id: res.chapter_id,
          name: newChapterName.trim(),
          description: null,
          energy_target: null,
          sort_order: chapters.length,
          created_at: new Date().toISOString(),
        })
        setNewChapterName('')
        setIsCreating(false)
      }
    } catch (e) {
      console.error('Failed to create chapter:', e)
    }
  }, [newChapterName, chapters.length, addChapter, sendCommandAsync])

  const handleDeleteChapter = useCallback(async (id: number) => {
    try {
      await sendCommandAsync({ type: 'delete_chapter', chapter_id: id })
      removeChapter(id)
    } catch (e) {
      console.error('Failed to delete chapter:', e)
      removeChapter(id)
    }
  }, [removeChapter, sendCommandAsync])

  const handleAddTrack = useCallback(async (chapterId: number, trackId: number) => {
    const current = chapterTracks.get(chapterId) || []
    if (current.includes(trackId)) return
    try {
      await sendCommandAsync({
        type: 'add_track_to_chapter',
        chapter_id: chapterId,
        track_id: trackId,
        position: current.length,
      })
      addTrackToChapter(chapterId, trackId)
    } catch (e) {
      addTrackToChapter(chapterId, trackId)
    }
  }, [chapterTracks, addTrackToChapter, sendCommandAsync])

  const handleRemoveTrack = useCallback(async (chapterId: number, trackId: number) => {
    try {
      await sendCommandAsync({
        type: 'remove_track_from_chapter',
        chapter_id: chapterId,
        track_id: trackId,
      })
      removeTrackFromChapter(chapterId, trackId)
    } catch (e) {
      removeTrackFromChapter(chapterId, trackId)
    }
  }, [removeTrackFromChapter, sendCommandAsync])

  const handleMagicSort = useCallback(async (chapterId: number) => {
    if (sorting) return
    setSorting(true)
    try {
      const res = await sendCommandAsync({
        type: 'sort_chapter',
        chapter_id: chapterId,
        strategy: sortStrategy,
      }) as { type: string; chapter_id: number; track_ids: number[] }
      if (res.type === 'chapter_sorted') {
        setChapterTracks(chapterId, res.track_ids)
      }
    } catch (e) {
      console.error('Magic sort failed:', e)
    } finally {
      setSorting(false)
    }
  }, [sortStrategy, sorting, sendCommandAsync, setChapterTracks])

  const handleDragStart = (trackId: number) => {
    setDraggedTrack(trackId)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (draggedTrack === null || !selectedChapterId) return

    const current = [...(chapterTracks.get(selectedChapterId) || [])]
    const fromIndex = current.indexOf(draggedTrack)
    if (fromIndex === -1) return

    current.splice(fromIndex, 1)
    current.splice(dropIndex, 0, draggedTrack)
    reorderTracks(selectedChapterId, current)
    setDraggedTrack(null)
    setDragOverIndex(null)
  }

  const selectedChapter = chapters.find((c) => c.id === selectedChapterId)
  const chapterTrackIds = selectedChapterId ? (chapterTracks.get(selectedChapterId) || []) : []

  return (
    <div className="h-full flex gap-4">
      {/* Chapters sidebar */}
      <div className="w-64 bg-dj-900 rounded-xl border border-dj-800 flex flex-col">
        <div className="p-4 border-b border-dj-800">
          <h3 className="text-sm font-semibold text-dj-200 mb-3">Chapters</h3>
          {!isCreating ? (
            <button
              onClick={() => setIsCreating(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-dj-800 hover:bg-dj-700 text-dj-300 text-sm rounded-lg transition-colors"
            >
              <FolderPlus className="w-4 h-4" />
              New Chapter
            </button>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Chapter name..."
                value={newChapterName}
                onChange={(e) => setNewChapterName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateChapter()}
                className="w-full bg-dj-950 border border-dj-700 rounded-lg px-3 py-2 text-sm text-dj-200 placeholder:text-dj-600 focus:outline-none focus:border-dj-accent"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreateChapter}
                  className="flex-1 px-3 py-1.5 bg-dj-accent hover:bg-dj-accent-hover text-white text-xs rounded-lg transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => { setIsCreating(false); setNewChapterName('') }}
                  className="flex-1 px-3 py-1.5 bg-dj-800 hover:bg-dj-700 text-dj-300 text-xs rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto p-2 space-y-1">
          {chapters.length === 0 && (
            <p className="text-xs text-dj-600 text-center py-4">No chapters yet</p>
          )}
          {chapters.map((chapter) => (
            <div
              key={chapter.id}
              onClick={() => selectChapter(chapter.id)}
              className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                selectedChapterId === chapter.id
                  ? 'bg-dj-accent/20 text-dj-accent'
                  : 'hover:bg-dj-800/60 text-dj-300'
              }`}
            >
              <span className="text-sm flex-1 truncate">{chapter.name}</span>
              <span className="text-xs text-dj-500">
                {(chapterTracks.get(chapter.id) || []).length}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteChapter(chapter.id) }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Chapter detail */}
      <div className="flex-1 flex flex-col gap-4">
        {selectedChapter ? (
          <>
            <div className="bg-dj-900 rounded-xl border border-dj-800 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-dj-50">{selectedChapter.name}</h2>
                  <p className="text-sm text-dj-400">
                    {chapterTrackIds.length} tracks
                    {selectedChapter.energy_target && ` · Target energy: ${selectedChapter.energy_target}/10`}
                  </p>
                </div>
                {selectedTrackId && !chapterTrackIds.includes(selectedTrackId) && (
                  <button
                    onClick={() => handleAddTrack(selectedChapter.id, selectedTrackId)}
                    className="flex items-center gap-2 px-3 py-2 bg-dj-accent hover:bg-dj-accent-hover text-white text-sm rounded-lg transition-colors"
                  >
                    <ArrowRight className="w-4 h-4" />
                    Add Selected Track
                  </button>
                )}
                {/* Magic Sort */}
                {chapterTrackIds.length >= 2 && (
                  <div className="flex items-center gap-2">
                    <select
                      value={sortStrategy}
                      onChange={(e) => setSortStrategy(e.target.value as any)}
                      className="bg-dj-800 border border-dj-700 text-dj-200 text-xs rounded-lg px-2 py-1.5"
                    >
                      <option value="energy_flow">Energy Flow</option>
                      <option value="harmonic">Harmonic</option>
                      <option value="bpm_ramp">BPM Ramp</option>
                      <option value="random">Random</option>
                    </select>
                    <button
                      onClick={() => handleMagicSort(selectedChapter.id)}
                      disabled={sorting}
                      className="flex items-center gap-1.5 px-3 py-2 bg-dj-800 hover:bg-dj-700 border border-dj-700 text-dj-200 text-sm rounded-lg transition-colors disabled:opacity-40"
                      title="Auto-sort tracks"
                    >
                      <Sparkles className="w-4 h-4 text-yellow-400" />
                      {sorting ? 'Sorting...' : 'Magic Sort'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 bg-dj-900 rounded-xl border border-dj-800 overflow-auto">
              {chapterTrackIds.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-dj-500 gap-3">
                  <Music className="w-10 h-10 text-dj-700" />
                  <p>Select a track and click "Add Selected Track"</p>
                  <p className="text-sm">Or drag tracks here</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {chapterTrackIds.map((trackId, index) => {
                    const track = tracks.find((t) => t.id === trackId)
                    if (!track) return null
                    return (
                      <div
                        key={trackId}
                        draggable
                        onDragStart={() => handleDragStart(trackId)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDrop={(e) => handleDrop(e, index)}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-move transition-colors ${
                          dragOverIndex === index ? 'bg-dj-accent/20 border border-dj-accent/40' : 'hover:bg-dj-800/50'
                        }`}
                      >
                        <GripVertical className="w-4 h-4 text-dj-600" />
                        <span className="text-xs text-dj-500 font-mono w-5">{index + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-dj-100 truncate">{track.title || 'Unknown'}</p>
                          <p className="text-xs text-dj-500 truncate">{track.artist || 'Unknown'}</p>
                        </div>
                        <span className="text-xs text-dj-400 font-mono">
                          {track.bpm ? Math.round(track.bpm) : '--'} BPM
                        </span>
                        <span className="text-xs font-mono text-dj-accent">
                          {track.camelot_key || track.key || '--'}
                        </span>
                        <button
                          onClick={() => handleRemoveTrack(selectedChapter.id, trackId)}
                          className="p-1 hover:text-red-400 text-dj-600 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-dj-500">
            <div className="text-center">
              <p className="text-lg mb-2">Select or create a chapter</p>
              <p className="text-sm">Organize tracks into DJ set chapters</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
