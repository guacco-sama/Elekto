import { useState, useCallback } from 'react'
import {
  Music, FolderOpen, HardDrive, Zap, CheckCircle2, ChevronRight,
  ChevronLeft, Headphones, Radio, Gauge, Fingerprint
} from 'lucide-react'

interface OnboardingProps {
  onComplete: () => void
  onScan: (path: string) => void
  sendCommandAsync: ReturnType<typeof import('../hooks/useWorker').useWorker>['sendCommandAsync']
}

type Step = 'welcome' | 'folder' | 'scanning' | 'features' | 'done'

export default function Onboarding({ onComplete, onScan, sendCommandAsync }: OnboardingProps) {
  const [step, setStep] = useState<Step>('welcome')
  const [musicPath, setMusicPath] = useState('')
  const [scanProgress, setScanProgress] = useState(0)
  const [scanStatus, setScanStatus] = useState('')

  const handleSelectFolder = useCallback(async () => {
    const result = await window.electronAPI.dialog.selectFolder()
    if (!result.canceled && result.filePaths.length > 0) {
      setMusicPath(result.filePaths[0])
    }
  }, [])

  const handleStartScan = useCallback(async () => {
    if (!musicPath) return
    setStep('scanning')
    setScanStatus('Scanning for audio files...')
    setScanProgress(10)

    try {
      const response = await sendCommandAsync<{
        type: string
        track_count: number
      }>({
        type: 'scan_folder',
        path: musicPath,
      })

      if (response.type === 'scan_complete') {
        setScanProgress(100)
        setScanStatus(`Found ${(response as any).track_count} tracks`)
        // Save path to settings
        await sendCommandAsync({
          type: 'set_setting',
          key: 'music_library_path',
          value: musicPath,
        })
        await sendCommandAsync({
          type: 'set_setting',
          key: 'onboarding_completed',
          value: 'true',
        })
        setTimeout(() => setStep('features'), 800)
      }
    } catch (err) {
      setScanStatus('Scan failed. You can retry from Settings later.')
      setScanProgress(0)
      setTimeout(() => setStep('features'), 1500)
    }
  }, [musicPath, sendCommandAsync])

  const handleSkip = useCallback(() => {
    sendCommandAsync({
      type: 'set_setting',
      key: 'onboarding_completed',
      value: 'true',
    }).catch(() => {})
    onComplete()
  }, [sendCommandAsync, onComplete])

  return (
    <div className="fixed inset-0 z-50 bg-dj-950 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-3 mb-12">
          {(['welcome', 'folder', 'scanning', 'features', 'done'] as Step[]).map((s, i) => {
            const active = step === s
            const done = ['folder', 'scanning', 'features', 'done'].indexOf(step) > i
            return (
              <div key={s} className="flex items-center gap-3">
                <div
                  className={`w-3 h-3 rounded-full transition-all duration-300 ${
                    active ? 'bg-dj-accent scale-125 shadow-lg shadow-dj-accent/40' :
                    done ? 'bg-green-400' : 'bg-dj-700'
                  }`}
                />
                {i < 4 && (
                  <div className={`w-8 h-0.5 rounded-full transition-colors ${done ? 'bg-green-400/60' : 'bg-dj-800'}`} />
                )}
              </div>
            )
          })}
        </div>

        {/* Step content */}
        <div className="bg-dj-900 border border-dj-800 rounded-2xl p-10 shadow-2xl">
          {step === 'welcome' && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 rounded-2xl bg-dj-accent/10 border border-dj-accent/20 flex items-center justify-center mx-auto">
                <Music className="w-10 h-10 text-dj-accent" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-dj-50">Welcome to Elekto</h1>
                <p className="text-dj-400 mt-3 max-w-md mx-auto leading-relaxed">
                  Your personal DJ music curator. Analyze, organize, and export your tracks
                  to Rekordbox and Engine Prime with intelligent tools.
                </p>
              </div>
              <div className="flex items-center justify-center gap-6 pt-4">
                <div className="flex flex-col items-center gap-2">
                  <Headphones className="w-5 h-5 text-dj-accent" />
                  <span className="text-xs text-dj-400">Real Audio</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Radio className="w-5 h-5 text-dj-accent" />
                  <span className="text-xs text-dj-400">Harmonic</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Gauge className="w-5 h-5 text-dj-accent" />
                  <span className="text-xs text-dj-400">Energy Curves</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Fingerprint className="w-5 h-5 text-dj-accent" />
                  <span className="text-xs text-dj-400">Cue Points</span>
                </div>
              </div>
              <div className="flex items-center justify-center gap-3 pt-4">
                <button
                  onClick={() => setStep('folder')}
                  className="flex items-center gap-2 px-6 py-3 bg-dj-accent hover:bg-dj-accent-hover text-white rounded-xl font-medium transition-all shadow-lg shadow-dj-accent/20"
                >
                  Get Started
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={handleSkip}
                  className="px-6 py-3 text-sm text-dj-500 hover:text-dj-300 transition-colors"
                >
                  Skip for now
                </button>
              </div>
            </div>
          )}

          {step === 'folder' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-dj-800 flex items-center justify-center mx-auto mb-4">
                  <FolderOpen className="w-8 h-8 text-dj-300" />
                </div>
                <h2 className="text-2xl font-bold text-dj-50">Where is your music?</h2>
                <p className="text-dj-400 mt-2">
                  Select the folder where your audio files live. Elekto will scan for
                  MP3, FLAC, WAV, AIFF, and M4A files.
                </p>
              </div>

              <div
                onClick={handleSelectFolder}
                className="group border-2 border-dashed border-dj-700 hover:border-dj-accent/50 rounded-xl p-8 text-center cursor-pointer transition-all hover:bg-dj-800/50"
              >
                {musicPath ? (
                  <div className="space-y-2">
                    <HardDrive className="w-6 h-6 text-dj-accent mx-auto" />
                    <p className="text-sm text-dj-200 font-mono break-all">{musicPath}</p>
                    <p className="text-xs text-dj-500">Click to change folder</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <FolderOpen className="w-8 h-8 text-dj-500 mx-auto group-hover:text-dj-400 transition-colors" />
                    <p className="text-sm text-dj-400 group-hover:text-dj-300 transition-colors">
                      Click to browse your music folder
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setStep('welcome')}
                  className="flex items-center gap-1 text-sm text-dj-500 hover:text-dj-300 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
                <button
                  onClick={handleStartScan}
                  disabled={!musicPath}
                  className="flex items-center gap-2 px-5 py-2.5 bg-dj-accent hover:bg-dj-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all"
                >
                  <Zap className="w-4 h-4" />
                  {musicPath ? 'Scan Library' : 'Select a folder first'}
                </button>
              </div>
            </div>
          )}

          {step === 'scanning' && (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-dj-accent/10 flex items-center justify-center mx-auto animate-pulse">
                <Music className="w-8 h-8 text-dj-accent" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-dj-50">Scanning your library...</h2>
                <p className="text-dj-400 mt-1 text-sm">{scanStatus}</p>
              </div>
              <div className="max-w-sm mx-auto">
                <div className="h-2 bg-dj-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-dj-accent rounded-full transition-all duration-500"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
                <p className="text-xs text-dj-600 mt-2 font-mono">{Math.round(scanProgress)}%</p>
              </div>
            </div>
          )}

          {step === 'features' && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-dj-50">You're all set</h2>
                <p className="text-dj-400 mt-2">
                  Here's what you can do with Elekto
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: <Zap className="w-5 h-5" />, title: 'Auto-Analyze', desc: 'BPM, key, energy, and cue points' },
                  { icon: <Radio className="w-5 h-5" />, title: 'Chapters', desc: 'Group tracks with magic sorting' },
                  { icon: <Gauge className="w-5 h-5" />, title: 'Energy Curves', desc: 'Visualize set energy flow' },
                  { icon: <HardDrive className="w-5 h-5" />, title: 'Export', desc: 'Rekordbox XML & Engine Prime' },
                ].map((f) => (
                  <div key={f.title} className="bg-dj-800/50 border border-dj-700/50 rounded-lg p-4 flex items-start gap-3">
                    <div className="text-dj-accent mt-0.5">{f.icon}</div>
                    <div>
                      <p className="text-sm font-medium text-dj-200">{f.title}</p>
                      <p className="text-xs text-dj-500 mt-0.5">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setStep('folder')}
                  className="flex items-center gap-1 text-sm text-dj-500 hover:text-dj-300 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
                <button
                  onClick={() => setStep('done')}
                  className="flex items-center gap-2 px-6 py-3 bg-dj-accent hover:bg-dj-accent-hover text-white rounded-xl font-medium transition-all"
                >
                  Continue
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10 text-green-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-dj-50">Ready to curate</h2>
                <p className="text-dj-400 mt-2">
                  Your library is loaded. Start analyzing tracks, build chapters,
                  and export to your DJ software.
                </p>
              </div>
              <button
                onClick={onComplete}
                className="px-8 py-3 bg-dj-accent hover:bg-dj-accent-hover text-white rounded-xl font-medium transition-all shadow-lg shadow-dj-accent/20"
              >
                Open Elekto
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-dj-600 mt-6">
          Elekto v0.1.0 — Local-first DJ curation tool
        </p>
      </div>
    </div>
  )
}
