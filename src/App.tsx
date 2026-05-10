import { useState, useCallback, useEffect, useRef } from 'react'
import { Library, ScatterChart, GitGraph, Settings, Music, Search, Wand2, Sparkles, Layers } from 'lucide-react'
import { useTrackStore } from './stores/trackStore'
import { useWorker } from './hooks/useWorker'
import { useKeyboard } from './hooks/useKeyboard'
import TrackList from './components/TrackList'
import ScanProgress from './components/ScanProgress'
import AnalysisProgressBar from './components/AnalysisProgress'
import ScatterMap from './components/ScatterMap'
import GraphPlaylist from './components/GraphPlaylist'
import WaveformPlayer from './components/WaveformPlayer'
import ChapterManager from './components/ChapterManager'
import Onboarding from './components/Onboarding'
import type { Track } from './stores/trackStore'

function App() {
  const [activeTab, setActiveTab] = useState<'library' | 'scatter' | 'graph' | 'chapters' | 'settings'>('library')
  const [dropping, setDropping] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [nlMode, setNlMode] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const { isReady, sendCommandAsync, sendCommandWithProgress } = useWorker()
  const setTracks = useTrackStore((s) => s.setTracks)
  const addTracks = useTrackStore((s) => s.addTracks)
  const setScanning = useTrackStore((s) => s.setScanning)
  const setScanProgress = useTrackStore((s) => s.setScanProgress)
  const tracks = useTrackStore((s) => s.tracks)
  const selectedTrackId = useTrackStore((s) => s.selectedTrackId)
  const setSelectedTrack = useTrackStore((s) => s.setSelectedTrack)
  const updateTrack = useTrackStore((s) => s.updateTrack)
  const setAnalyzing = useTrackStore((s) => s.setAnalyzing)
  const setAnalyzeProgress = useTrackStore((s) => s.setAnalyzeProgress)

  const handleAnalyzeAll = useCallback(async () => {
    const unanalyzed = tracks.filter((t) => !t.bpm)
    if (unanalyzed.length === 0) return

    setAnalyzing(true)
    try {
      await sendCommandWithProgress<{
        type: string
      }>({
        type: 'analyze_all',
        track_ids: unanalyzed.map((t) => t.id),
        threads: 4,
      }, (progress) => {
        const p = progress as unknown as {
          track_id: number
          progress: number
          status: string
        }
        const match = p.status.match(/(\d+)\/(\d+)/)
        if (match) {
          setAnalyzeProgress(parseInt(match[1]), parseInt(match[2]), p.status)
        }
      })
      // Refresh all tracks
      const response = await sendCommandAsync<{
        type: string
        tracks: Track[]
        total: number
      }>({ type: 'get_tracks', limit: 100, offset: 0 })
      if (response.type === 'tracks') {
        setTracks(response.tracks, response.total)
      }
    } catch (err) {
      console.error('Batch analysis failed:', err)
    } finally {
      setAnalyzing(false)
    }
  }, [tracks, sendCommandWithProgress, sendCommandAsync, setTracks, setAnalyzing, setAnalyzeProgress])

  const handleAutoTagAll = useCallback(async () => {
    const untagged = tracks.filter((t) => !t.genre && t.bpm)
    for (const track of untagged.slice(0, 5)) {
      try {
        const response = await sendCommandAsync<{
          type: string
          track_id: number
          tags: { genre: string; sub_genre: string; emotion: string; energy: number; danceability: number }
        }>({
          type: 'auto_tag_track',
          track_id: track.id,
        })
        if (response.type === 'auto_tag_complete') {
          updateTrack(track.id, response.tags)
        }
      } catch (err) {
        console.error(`Auto-tag failed for track ${track.id}:`, err)
      }
    }
  }, [tracks, sendCommandAsync, updateTrack])

  const runScan = useCallback(async (path: string) => {
    setScanning(true, path)
    setScanProgress(10)
    try {
      const response = await sendCommandAsync<{
        type: string
        track_count: number
        tracks: Track[]
      }>({
        type: 'scan_folder',
        path,
      })
      if (response.type === 'scan_complete') {
        addTracks(response.tracks)
        setScanProgress(100)
        setTimeout(() => setScanning(false), 500)
      }
    } catch (err) {
      console.error('Scan failed:', err)
      setScanning(false)
    }
  }, [sendCommandAsync, addTracks, setScanning, setScanProgress])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDropping(false)
    const files = e.dataTransfer.files
    if (files.length === 0) return
    const file = files[0] as unknown as { path?: string }
    const path = file.path
    if (!path) return
    await runScan(path)
  }, [runScan])

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      const response = await sendCommandAsync<{
        type: string
        tracks: Track[]
        total: number
      }>({
        type: 'get_tracks',
        limit: 100,
        offset: 0,
      })
      if (response.type === 'tracks') {
        setTracks(response.tracks, response.total)
      }
      return
    }

    if (nlMode) {
      const response = await sendCommandAsync<{
        type: string
        tracks: Track[]
        total: number
      }>({
        type: 'search_nl',
        query: searchQuery,
      })
      if (response.type === 'tracks') {
        setTracks(response.tracks, response.total)
      }
    } else {
      const response = await sendCommandAsync<{
        type: string
        tracks: Track[]
        total: number
      }>({
        type: 'search_tracks',
        query: searchQuery,
      })
      if (response.type === 'tracks') {
        setTracks(response.tracks, response.total)
      }
    }
  }, [searchQuery, nlMode, sendCommandAsync, setTracks])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  // Keyboard shortcuts
  useKeyboard({
    onPlayPause: () => {
      // Find the waveform player's play toggle - simplified: focus selected track
    },
    onSearchFocus: () => {
      searchRef.current?.focus()
    },
    onTabSwitch: (tab) => setActiveTab(tab as any),
    onAnalyze: handleAnalyzeAll,
    onEscape: () => {
      setSelectedTrack(null)
    },
    enabled: !showOnboarding,
  })

  // Check onboarding status when worker is ready
  useEffect(() => {
    if (!isReady) return
    sendCommandAsync<{
      type: string
      key: string
      value: string | null
    }>({ type: 'get_setting', key: 'onboarding_completed' }).then((res) => {
      if (res.type === 'config_value' && res.value !== 'true') {
        setShowOnboarding(true)
      }
    }).catch(() => {
      setShowOnboarding(true)
    })
  }, [isReady, sendCommandAsync])

  const handleOnboardingComplete = useCallback(async () => {
    setShowOnboarding(false)
    // Refresh tracks
    const response = await sendCommandAsync<{
      type: string
      tracks: Track[]
      total: number
    }>({ type: 'get_tracks', limit: 100, offset: 0 })
    if (response.type === 'tracks') {
      setTracks(response.tracks, response.total)
    }
  }, [sendCommandAsync, setTracks])

  const handleOnboardingScan = useCallback((path: string) => {
    runScan(path)
  }, [runScan])

  return (
    <>
      {showOnboarding && (
        <Onboarding
          onComplete={handleOnboardingComplete}
          onScan={handleOnboardingScan}
          sendCommandAsync={sendCommandAsync}
        />
      )}
    <div className="h-screen flex flex-col bg-dj-950">
      {/* Title Bar */}
      <div className="h-12 bg-dj-900 border-b border-dj-800 flex items-center px-4">
        <div className="flex items-center gap-2">
          <Music className="w-5 h-5 text-dj-accent" />
          <span className="font-semibold text-dj-50 text-sm tracking-wide">Elekto</span>
          <span className="text-xs text-dj-500 bg-dj-800 px-2 py-0.5 rounded-full font-mono">v0.1.0</span>
          {!isReady && (
            <span className="text-xs text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full ml-2">
              Worker connecting...
            </span>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <nav className="w-16 bg-dj-900 border-r border-dj-800 flex flex-col items-center py-4 gap-2">
          <NavButton
            icon={<Library className="w-5 h-5" />}
            label="Library"
            active={activeTab === 'library'}
            onClick={() => setActiveTab('library')}
          />
          <NavButton
            icon={<ScatterChart className="w-5 h-5" />}
            label="Scatter"
            active={activeTab === 'scatter'}
            onClick={() => setActiveTab('scatter')}
          />
          <NavButton
            icon={<GitGraph className="w-5 h-5" />}
            label="Graph"
            active={activeTab === 'graph'}
            onClick={() => setActiveTab('graph')}
          />
          <NavButton
            icon={<Layers className="w-5 h-5" />}
            label="Chapters"
            active={activeTab === 'chapters'}
            onClick={() => setActiveTab('chapters')}
          />
          <div className="flex-1" />
          <NavButton
            icon={<Settings className="w-5 h-5" />}
            label="Settings"
            active={activeTab === 'settings'}
            onClick={() => setActiveTab('settings')}
          />
        </nav>

        {/* Content Area */}
        <main className="flex-1 overflow-auto p-6">
          {activeTab === 'library' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-dj-50">Library</h1>
                  <p className="text-sm text-dj-400 mt-1">
                    {tracks.length === 0 
                      ? 'Drop a folder to import your music collection' 
                      : `${tracks.length} tracks ready for curation`}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {tracks.length > 0 && (
                    <>
                      <button
                        onClick={handleAnalyzeAll}
                        className="flex items-center gap-2 px-3 py-2 bg-dj-accent hover:bg-dj-accent-hover text-white text-sm rounded-lg transition-colors"
                      >
                        <Wand2 className="w-4 h-4" />
                        Analyze
                      </button>
                      <button
                        onClick={handleAutoTagAll}
                        className="flex items-center gap-2 px-3 py-2 bg-dj-800 hover:bg-dj-700 border border-dj-700 text-dj-200 text-sm rounded-lg transition-colors"
                      >
                        <Sparkles className="w-4 h-4 text-yellow-400" />
                        Auto-Tag
                      </button>
                    </>
                  )}
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-dj-500" />
                    <input
                      ref={searchRef}
                      type="text"
                      placeholder={nlMode ? '"dark techno 130bpm"' : 'Search tracks...'}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className={`bg-dj-900 border rounded-lg pl-9 pr-20 py-2 text-sm text-dj-200 placeholder:text-dj-600 focus:outline-none focus:border-dj-accent w-80 transition-colors ${nlMode ? 'border-dj-accent/60' : 'border-dj-700'}`}
                    />
                    <button
                      onClick={() => setNlMode(!nlMode)}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider transition-colors ${nlMode ? 'bg-dj-accent text-white' : 'bg-dj-800 text-dj-500 hover:text-dj-300'}`}
                      title="Toggle Natural Language Search"
                    >
                      {nlMode ? 'NL' : 'TXT'}
                    </button>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-dj-accent font-mono">{tracks.length}</div>
                    <div className="text-xs text-dj-500 uppercase tracking-wider">Tracks</div>
                  </div>
                </div>
              </div>

              <ScanProgress />

              <AnalysisProgressBar />

              {/* Waveform preview for selected track */}
              {selectedTrackId && (() => {
                const selectedTrack = tracks.find((t) => t.id === selectedTrackId)
                return (
                  <div className="bg-dj-900 rounded-xl border border-dj-800 p-4">
                    <WaveformPlayer
                      trackId={selectedTrackId}
                      trackTitle={selectedTrack?.title || 'Unknown'}
                      trackArtist={selectedTrack?.artist || 'Unknown'}
                      filePath={selectedTrack?.file_path || ''}
                      sendCommandAsync={sendCommandAsync as any}
                    />
                  </div>
                )
              })()}

              {tracks.length === 0 && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDropping(true)
                  }}
                  onDragLeave={() => setDropping(false)}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl h-64 flex flex-col items-center justify-center gap-4 transition-all duration-300 cursor-pointer ${
                    dropping
                      ? 'border-dj-accent bg-dj-accent/5 scale-[1.02]'
                      : 'border-dj-700 bg-dj-900/50 hover:border-dj-600 hover:bg-dj-800/50'
                  }`}
                >
                  <div className="w-16 h-16 rounded-2xl bg-dj-800 flex items-center justify-center">
                    <Music className="w-8 h-8 text-dj-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-dj-200 font-medium">Drop your music folder here</p>
                    <p className="text-dj-500 text-sm mt-1">Supports MP3, FLAC, WAV, AIFF, M4A</p>
                  </div>
                </div>
              )}

              <TrackList />
            </div>
          )}

          {activeTab === 'scatter' && <ScatterMap />}
          {activeTab === 'graph' && <GraphPlaylist />}
          {activeTab === 'chapters' && (
            <div className="h-full">
              <h1 className="text-2xl font-bold text-dj-50 mb-4">Chapter Manager</h1>
              <ChapterManager sendCommandAsync={sendCommandAsync as any} />
            </div>
          )}
          {activeTab === 'settings' && <SettingsView sendCommandAsync={sendCommandAsync} />}
        </main>
      </div>
    </div>
      </>
  )
}

function NavButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 ${
        active
          ? 'bg-dj-accent text-white shadow-lg shadow-dj-accent/20'
          : 'text-dj-400 hover:text-dj-200 hover:bg-dj-800'
      }`}
    >
      {icon}
    </button>
  )
}

function ScatterMapView() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-4">
      <ScatterChart className="w-16 h-16 text-dj-700" />
      <div>
        <h2 className="text-xl font-bold text-dj-300">Scatter Map</h2>
        <p className="text-dj-500 mt-1">Visualize your library as a sonic landscape</p>
        <p className="text-sm text-dj-600 mt-2">Import tracks to unlock this feature</p>
      </div>
    </div>
  )
}

function GraphPlaylistView() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-4">
      <GitGraph className="w-16 h-16 text-dj-700" />
      <div>
        <h2 className="text-xl font-bold text-dj-300">Graph Playlist</h2>
        <p className="text-dj-500 mt-1">Build sets by discovering track connections</p>
        <p className="text-sm text-dj-600 mt-2">Import and analyze tracks to unlock this feature</p>
      </div>
    </div>
  )
}

function SettingsView({ sendCommandAsync }: { sendCommandAsync: ReturnType<typeof useWorker>['sendCommandAsync'] }) {
  const [exportStatus, setExportStatus] = useState<string | null>(null)

  const handleExportRekordbox = async () => {
    try {
      const result = await window.electronAPI.dialog.saveFile({
        title: 'Export Rekordbox XML',
        defaultPath: 'rekordbox.xml',
        filters: [{ name: 'XML', extensions: ['xml'] }],
      })
      if (result.canceled || !result.filePath) return

      setExportStatus('Exporting to Rekordbox...')
      const response = await sendCommandAsync<{
        type: string
        path: string
      }>({
        type: 'export_rekordbox',
        chapter_ids: [],
        output_path: result.filePath,
      })
      if (response.type === 'export_complete') {
        setExportStatus(`Rekordbox XML exported to ${response.path}`)
      } else {
        setExportStatus('Export failed')
      }
    } catch {
      setExportStatus('Export failed')
    }
    setTimeout(() => setExportStatus(null), 5000)
  }

  const handleExportEnginePrime = async () => {
    try {
      const result = await window.electronAPI.dialog.selectDirectory({
        title: 'Export Engine Prime Library',
        buttonLabel: 'Export Here',
      })
      if (result.canceled || result.filePaths.length === 0) return

      setExportStatus('Exporting to Engine Prime...')
      const response = await sendCommandAsync<{
        type: string
        path: string
      }>({
        type: 'export_engine_prime',
        chapter_ids: [],
        output_path: result.filePaths[0],
      })
      if (response.type === 'export_complete') {
        setExportStatus(`Engine Prime library exported to ${response.path}`)
      } else {
        setExportStatus('Export failed')
      }
    } catch {
      setExportStatus('Export failed')
    }
    setTimeout(() => setExportStatus(null), 5000)
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-dj-50 mb-6">Settings</h1>

      <div className="space-y-4">
        <div className="bg-dj-900 rounded-xl border border-dj-800 p-4">
          <h3 className="font-medium text-dj-200 mb-3">Export</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dj-200">Rekordbox XML</p>
                <p className="text-xs text-dj-500">Export to Pioneer Rekordbox (rekordbox.xml)</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleExportRekordbox}
                  className="px-3 py-1.5 bg-dj-accent hover:bg-dj-accent-hover text-white text-sm rounded-lg transition-colors"
                >
                  Export XML
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dj-200">Engine Prime</p>
                <p className="text-xs text-dj-500">Export to Denon Engine DJ (m.db + p.db + crates)</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleExportEnginePrime}
                  className="px-3 py-1.5 bg-dj-accent hover:bg-dj-accent-hover text-white text-sm rounded-lg transition-colors"
                >
                  Export DB
                </button>
              </div>
            </div>
            {exportStatus && (
              <p className="text-xs text-dj-400 mt-2">{exportStatus}</p>
            )}
          </div>
        </div>

        <div className="bg-dj-900 rounded-xl border border-dj-800 p-4">
          <h3 className="font-medium text-dj-200 mb-3">Library</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dj-200">Music Library Path</p>
                <p className="text-xs text-dj-500">Folder scanned for audio files</p>
              </div>
              <button className="px-3 py-1.5 bg-dj-800 hover:bg-dj-700 text-dj-300 text-sm rounded-lg transition-colors">
                Browse...
              </button>
            </div>
          </div>
        </div>

        <div className="bg-dj-900 rounded-xl border border-dj-800 p-4">
          <h3 className="font-medium text-dj-200 mb-3">Analysis</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dj-200">Analysis Threads</p>
                <p className="text-xs text-dj-500">Parallel tracks analyzed simultaneously</p>
              </div>
              <select className="bg-dj-800 border border-dj-700 text-dj-200 text-sm rounded-lg px-3 py-1.5">
                <option value="4">4 threads</option>
                <option value="8">8 threads</option>
                <option value="12">12 threads</option>
                <option value="16">16 threads</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-dj-900 rounded-xl border border-dj-800 p-4">
          <h3 className="font-medium text-dj-200 mb-3">Models</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dj-200">Auto-Tagger</p>
                <p className="text-xs text-dj-500">Rule-based classification (no download required)</p>
              </div>
              <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded">Ready</span>
            </div>
          </div>
        </div>

        <div className="bg-dj-900 rounded-xl border border-dj-800 p-4">
          <h3 className="font-medium text-dj-200 mb-3">Getting Started</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dj-200">Onboarding</p>
                <p className="text-xs text-dj-500">Show the welcome wizard again</p>
              </div>
              <button
                onClick={async () => {
                  await sendCommandAsync({
                    type: 'set_setting',
                    key: 'onboarding_completed',
                    value: 'false',
                  })
                  window.location.reload()
                }}
                className="px-3 py-1.5 bg-dj-800 hover:bg-dj-700 text-dj-300 text-sm rounded-lg transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
