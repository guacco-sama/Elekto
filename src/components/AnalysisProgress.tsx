import { useTrackStore } from '../stores/trackStore'
import { Activity } from 'lucide-react'

export default function AnalysisProgressBar() {
  const isAnalyzing = useTrackStore((s) => s.isAnalyzing)
  const progress = useTrackStore((s) => s.analyzeProgress)
  const processed = useTrackStore((s) => s.analyzeProcessed)
  const total = useTrackStore((s) => s.analyzeTotal)
  const status = useTrackStore((s) => s.analyzeStatus)

  if (!isAnalyzing) return null

  return (
    <div className="bg-dj-900 border border-dj-800 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-3 mb-3">
        <Activity className="w-5 h-5 text-dj-accent animate-pulse" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-dj-200">Analyzing tracks...</p>
          <p className="text-xs text-dj-500 truncate mt-0.5">{status}</p>
        </div>
        <span className="text-xs text-dj-accent font-mono">
          {processed}/{total}
        </span>
      </div>
      <div className="h-1.5 bg-dj-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-dj-accent rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
