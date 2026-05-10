import { useTrackStore } from '../stores/trackStore'
import { Music, Clock, Disc, Trash2, Wand2, Sparkles, X } from 'lucide-react'

function formatDuration(ms: number | null): string {
  if (!ms) return '--:--'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '--'
  const mb = bytes / (1024 * 1024)
  if (mb >= 100) return `${Math.round(mb)} MB`
  return `${mb.toFixed(1)} MB`
}

function EnergyBadge({ energy }: { energy: number | null }) {
  if (!energy) return <span className="text-dj-600">--</span>
  const colors = [
    'bg-dj-800 text-dj-400', 'bg-dj-800 text-dj-400', 'bg-dj-700 text-dj-300', 'bg-dj-700 text-dj-300',
    'bg-dj-600 text-dj-200', 'bg-dj-500 text-white', 'bg-dj-accent/30 text-dj-accent',
    'bg-dj-accent/50 text-dj-accent', 'bg-dj-accent/70 text-white', 'bg-dj-accent text-white',
  ]
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[energy - 1] || colors[0]}`}>
      {energy}/10
    </span>
  )
}

export default function TrackList() {
  const tracks = useTrackStore((s) => s.tracks)
  const totalTracks = useTrackStore((s) => s.totalTracks)
  const selectedTrackId = useTrackStore((s) => s.selectedTrackId)
  const selectedTrackIds = useTrackStore((s) => s.selectedTrackIds)
  const setSelectedTrack = useTrackStore((s) => s.setSelectedTrack)
  const toggleTrackSelection = useTrackStore((s) => s.toggleTrackSelection)
  const selectTrackRange = useTrackStore((s) => s.selectTrackRange)
  const clearSelection = useTrackStore((s) => s.clearSelection)
  const lastSelectedRef = (() => {
    let last: number | null = null
    return {
      get: () => last,
      set: (id: number | null) => { last = id }
    }
  })()

  const selectionCount = selectedTrackIds.size

  const handleRowClick = (trackId: number, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      toggleTrackSelection(trackId)
      lastSelectedRef.set(trackId)
    } else if (e.shiftKey && lastSelectedRef.get() !== null) {
      e.preventDefault()
      selectTrackRange(lastSelectedRef.get()!, trackId, tracks)
      lastSelectedRef.set(trackId)
    } else {
      setSelectedTrack(trackId)
      lastSelectedRef.set(trackId)
    }
  }

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-dj-500 gap-3">
        <Disc className="w-10 h-10 text-dj-700" />
        <p>No tracks imported yet</p>
        <p className="text-sm">Drop a folder to get started</p>
      </div>
    )
  }

  return (
    <div className="bg-dj-900 rounded-xl border border-dj-800 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-dj-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-dj-accent" />
          <span className="text-sm font-medium text-dj-200">
            {totalTracks} {totalTracks === 1 ? 'track' : 'tracks'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {selectionCount > 0 && (
            <span className="text-xs text-dj-accent bg-dj-accent/10 px-2 py-1 rounded">
              {selectionCount} selected
            </span>
          )}
          <div className="text-xs text-dj-500">
            {tracks.length} shown
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto max-h-[calc(100vh-320px)]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-dj-900 z-10">
            <tr className="text-xs text-dj-500 uppercase tracking-wider font-medium border-b border-dj-800">
              <th className="px-4 py-2 text-left w-12">#</th>
              <th className="px-4 py-2 text-left">Title</th>
              <th className="px-4 py-2 text-left w-40">Artist</th>
              <th className="px-4 py-2 text-left w-28">Genre</th>
              <th className="px-4 py-2 text-left w-16">BPM</th>
              <th className="px-4 py-2 text-left w-16">Key</th>
              <th className="px-4 py-2 text-left w-20">Energy</th>
              <th className="px-4 py-2 text-right w-20">
                <Clock className="w-3.5 h-3.5 inline" />
              </th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((track, index) => {
              const isSelected = selectedTrackIds.has(track.id)
              const isSingleSelected = selectedTrackId === track.id
              return (
                <tr
                  key={track.id}
                  onClick={(e) => handleRowClick(track.id, e)}
                  className={`border-b border-dj-800/50 cursor-pointer transition-colors ${
                    isSelected
                      ? isSingleSelected
                        ? 'bg-dj-accent/15'
                        : 'bg-dj-accent/8'
                      : 'hover:bg-dj-800/40'
                  }`}
                >
                  <td className="px-4 py-2.5 text-dj-500 text-xs">
                    {isSelected ? (
                      <span className="inline-block w-4 h-4 rounded-full bg-dj-accent/30 border border-dj-accent/60 text-dj-accent text-[9px] flex items-center justify-center">
                        ✓
                      </span>
                    ) : (
                      index + 1
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded bg-dj-800 flex items-center justify-center flex-shrink-0">
                        <Music className="w-4 h-4 text-dj-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-dj-100 truncate font-medium">
                          {track.title || 'Unknown Title'}
                        </p>
                        <p className="text-xs text-dj-500 truncate">
                          {track.album || 'Unknown Album'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-dj-300 truncate">
                    {track.artist || 'Unknown Artist'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs bg-dj-800 text-dj-300 px-2 py-0.5 rounded">
                      {track.genre || 'Unknown'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-dj-300 font-mono text-xs">
                    {track.bpm ? Math.round(track.bpm).toString() : '--'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-mono text-dj-accent">
                      {track.camelot_key || track.key || '--'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <EnergyBadge energy={track.energy} />
                  </td>
                  <td className="px-4 py-2.5 text-right text-dj-400 text-xs font-mono">
                    {formatDuration(track.duration_ms)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
