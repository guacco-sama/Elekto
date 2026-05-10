import { useTrackStore } from '../stores/trackStore'
import { Loader2, FolderOpen } from 'lucide-react'

export default function ScanProgress() {
  const isScanning = useTrackStore((s) => s.isScanning)
  const scanProgress = useTrackStore((s) => s.scanProgress)
  const scanPath = useTrackStore((s) => s.scanPath)

  if (!isScanning) return null

  return (
    <div className="bg-dj-accent/10 border border-dj-accent/20 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-3 mb-3">
        <Loader2 className="w-5 h-5 text-dj-accent animate-spin" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-dj-200">Scanning library...</p>
          {scanPath && (
            <p className="text-xs text-dj-500 truncate flex items-center gap-1 mt-0.5">
              <FolderOpen className="w-3 h-3" />
              {scanPath}
            </p>
          )}
        </div>
        <span className="text-xs text-dj-accent font-mono">{Math.round(scanProgress)}%</span>
      </div>
      <div className="h-1.5 bg-dj-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-dj-accent rounded-full transition-all duration-300"
          style={{ width: `${scanProgress}%` }}
        />
      </div>
    </div>
  )
}
