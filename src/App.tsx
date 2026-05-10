import { useState } from 'react'
import { Library, ScatterChart, GitGraph, Settings, Music } from 'lucide-react'

function App() {
  const [activeTab, setActiveTab] = useState<'library' | 'scatter' | 'graph' | 'settings'>('library')

  return (
    <div className="h-screen flex flex-col bg-dj-950">
      {/* Title Bar */}
      <div className="h-12 bg-dj-900 border-b border-dj-800 flex items-center px-4 drag-region">
        <div className="flex items-center gap-2">
          <Music className="w-5 h-5 text-dj-accent" />
          <span className="font-semibold text-dj-50 text-sm tracking-wide">DJ Curation</span>
          <span className="text-xs text-dj-500 bg-dj-800 px-2 py-0.5 rounded-full font-mono">v0.1.0</span>
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
          {activeTab === 'library' && <LibraryView />}
          {activeTab === 'scatter' && <ScatterMapView />}
          {activeTab === 'graph' && <GraphPlaylistView />}
          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>
    </div>
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

function LibraryView() {
  const [dropping, setDropping] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dj-50">Library</h1>
          <p className="text-sm text-dj-400 mt-1">Drop a folder to import your music collection</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-dj-accent font-mono">0</div>
          <div className="text-xs text-dj-500 uppercase tracking-wider">Tracks</div>
        </div>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDropping(true)
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDropping(false)
          // TODO: Handle file drop
        }}
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

      {/* Track List Placeholder */}
      <div className="bg-dj-900 rounded-xl border border-dj-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-dj-800 flex items-center gap-4 text-xs text-dj-400 uppercase tracking-wider font-medium">
          <span className="w-8">#</span>
          <span className="flex-1">Title</span>
          <span className="w-32">Artist</span>
          <span className="w-24">Genre</span>
          <span className="w-16">BPM</span>
          <span className="w-16">Key</span>
          <span className="w-16">Energy</span>
          <span className="w-16 text-right">Duration</span>
        </div>
        <div className="px-4 py-12 text-center text-dj-500">
          <p>No tracks imported yet</p>
          <p className="text-sm mt-1">Drop a folder above to get started</p>
        </div>
      </div>
    </div>
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

function SettingsView() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-dj-50 mb-6">Settings</h1>
      
      <div className="space-y-4">
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
                <p className="text-sm text-dj-200">LLM Model</p>
                <p className="text-xs text-dj-500">Qwen3.5-0.8B for natural language search</p>
              </div>
              <button className="px-3 py-1.5 bg-dj-accent hover:bg-dj-accent-hover text-white text-sm rounded-lg transition-colors">
                Download
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
