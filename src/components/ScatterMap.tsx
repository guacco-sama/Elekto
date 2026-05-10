import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useTrackStore } from '../stores/trackStore'
import { RotateCcw, Palette, MousePointer2 } from 'lucide-react'

type ColorMode = 'genre' | 'energy' | 'danceability' | 'key'

const GENRE_COLORS: Record<string, number> = {
  'Drum & Bass': 0xff3333,
  'Dubstep': 0xff6600,
  'Trap': 0xffaa00,
  'Techno': 0x00ccff,
  'Trance': 0x9966ff,
  'House': 0x33ff66,
  'Breaks': 0xff00cc,
  'Hip-Hop': 0xffcc00,
  'R&B': 0xff6699,
  'Ambient': 0x8888ff,
  'Electronic': 0xaaaaaa,
}

function getGenreColor(genre: string | null): number {
  if (!genre) return 0x666666
  return GENRE_COLORS[genre] ?? 0x888888
}

function getEnergyColor(energy: number | null): number {
  if (energy === null) return 0x666666
  // Low energy = blue, high energy = red
  const t = (energy - 1) / 9
  return new THREE.Color().lerpColors(
    new THREE.Color(0x4444ff),
    new THREE.Color(0xff4444),
    t
  ).getHex()
}

function getDanceColor(dance: number | null): number {
  if (dance === null) return 0x666666
  const t = (dance - 1) / 9
  return new THREE.Color().lerpColors(
    new THREE.Color(0x44ff44),
    new THREE.Color(0xff44ff),
    t
  ).getHex()
}

const KEY_COLORS: Record<string, number> = {
  'A': 0xff0000, 'B': 0xff7f00, 'C': 0xffff00, 'D': 0x00ff00,
  'E': 0x0000ff, 'F': 0x4b0082, 'G': 0x9400d3,
}

function getKeyColor(key: string | null): number {
  if (!key) return 0x666666
  const letter = key.charAt(0).toUpperCase()
  return KEY_COLORS[letter] ?? 0x888888
}

function getColor(track: ReturnType<typeof useTrackStore.getState>['tracks'][0], mode: ColorMode): number {
  switch (mode) {
    case 'genre': return getGenreColor(track.genre)
    case 'energy': return getEnergyColor(track.energy)
    case 'danceability': return getDanceColor(track.danceability)
    case 'key': return getKeyColor(track.key)
  }
}

export default function ScatterMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const pointsRef = useRef<THREE.Mesh[]>([])

  const tracks = useTrackStore((s) => s.tracks)
  const analyzedTracks = tracks.filter((t) => t.bpm !== null)
  const setSelectedTrack = useTrackStore((s) => s.setSelectedTrack)
  const [colorMode, setColorMode] = useState<ColorMode>('genre')
  const [hoveredTrack, setHoveredTrack] = useState<typeof analyzedTracks[0] | null>(null)

  const resetCamera = useCallback(() => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return
    camera.position.set(12, 8, 12)
    controls.target.set(0, 5, 0)
    controls.update()
  }, [])

  useEffect(() => {
    if (!containerRef.current || analyzedTracks.length === 0) return

    const container = containerRef.current
    const w = container.clientWidth
    const h = container.clientHeight

    // Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0a0f)
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000)
    camera.position.set(12, 8, 12)
    cameraRef.current = camera

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.target.set(0, 5, 0)
    controlsRef.current = controls

    // Grid
    const grid = new THREE.GridHelper(20, 20, 0x1a1a2e, 0x12121a)
    scene.add(grid)

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.4)
    scene.add(ambient)
    const dir = new THREE.DirectionalLight(0xffffff, 0.8)
    dir.position.set(5, 10, 5)
    scene.add(dir)

    // Normalize data ranges
    const bpms = analyzedTracks.map((t) => t.bpm || 128)
    const energies = analyzedTracks.map((t) => t.energy || 5)
    const dances = analyzedTracks.map((t) => t.danceability || 5)
    const minBpm = Math.min(...bpms)
    const maxBpm = Math.max(...bpms) || minBpm + 1
    const minEnergy = Math.min(...energies)
    const maxEnergy = Math.max(...energies) || minEnergy + 1

    // Scatter points
    const points: THREE.Mesh[] = []
    const geometry = new THREE.SphereGeometry(0.25, 16, 16)

    analyzedTracks.forEach((track) => {
      const bpm = track.bpm || 128
      const energy = track.energy || 5
      const dance = track.danceability || 5

      const x = ((bpm - minBpm) / (maxBpm - minBpm)) * 16 - 8
      const y = ((energy - minEnergy) / (maxEnergy - minEnergy)) * 10 + 0.5
      const z = ((dance - 1) / 9) * 16 - 8

      const color = getColor(track, colorMode)
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.3,
        roughness: 0.4,
        metalness: 0.6,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(x, y, z)
      mesh.userData = { track }
      scene.add(mesh)
      points.push(mesh)
    })
    pointsRef.current = points

    // Raycaster
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()
    let hovered: THREE.Mesh | null = null

    const onMouseMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const intersects = raycaster.intersectObjects(points)

      if (hovered) {
        const mat = hovered.material as THREE.MeshStandardMaterial
        mat.emissiveIntensity = 0.3
        hovered.scale.set(1, 1, 1)
        hovered = null
        setHoveredTrack(null)
      }

      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh
        hovered = hit
        const mat = hit.material as THREE.MeshStandardMaterial
        mat.emissiveIntensity = 1.0
        hit.scale.set(1.5, 1.5, 1.5)
        setHoveredTrack(hit.userData.track)
      }
    }
    renderer.domElement.addEventListener('mousemove', onMouseMove)

    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const intersects = raycaster.intersectObjects(points)

      if (intersects.length > 0) {
        const track = intersects[0].object.userData.track
        setSelectedTrack(track.id)
      }
    }
    renderer.domElement.addEventListener('click', onClick)

    // Animation
    let animId: number
    const animate = () => {
      animId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // Resize
    const onResize = () => {
      const nw = container.clientWidth
      const nh = container.clientHeight
      camera.aspect = nw / nh
      camera.updateProjectionMatrix()
      renderer.setSize(nw, nh)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', onResize)
      renderer.domElement.removeEventListener('mousemove', onMouseMove)
      renderer.domElement.removeEventListener('click', onClick)
      controls.dispose()
      // Dispose all Three.js objects to prevent GPU memory leaks
      points.forEach((mesh) => {
        const mat = mesh.material as THREE.MeshStandardMaterial
        mat.dispose()
        scene.remove(mesh)
      })
      geometry.dispose()
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [analyzedTracks, colorMode, setSelectedTrack])

  // Re-color points when colorMode changes
  useEffect(() => {
    pointsRef.current.forEach((mesh) => {
      const track = mesh.userData.track
      const color = getColor(track, colorMode)
      const mat = mesh.material as THREE.MeshStandardMaterial
      mat.color.setHex(color)
      mat.emissive.setHex(color)
    })
  }, [colorMode])

  const colorModeLabel: Record<ColorMode, string> = {
    genre: 'Genre',
    energy: 'Energy',
    danceability: 'Danceability',
    key: 'Musical Key',
  }

  if (analyzedTracks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-dj-500">
        <div className="text-center">
          <p className="text-lg mb-2">No analyzed tracks yet</p>
          <p className="text-sm">Analyze some tracks in the Library to see the Scatter Map</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-dj-50">Scatter Map</h2>
          <p className="text-sm text-dj-400">
            X = BPM · Y = Energy · Z = Danceability
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Color mode toggle */}
          <div className="flex items-center gap-1 bg-dj-900 border border-dj-700 rounded-lg p-1">
            {(['genre', 'energy', 'danceability', 'key'] as ColorMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setColorMode(mode)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  colorMode === mode
                    ? 'bg-dj-accent text-white'
                    : 'text-dj-500 hover:text-dj-300'
                }`}
              >
                {colorModeLabel[mode]}
              </button>
            ))}
          </div>

          <button
            onClick={resetCamera}
            className="p-2 bg-dj-900 border border-dj-700 hover:bg-dj-800 rounded-lg text-dj-400 hover:text-dj-200 transition-colors"
            title="Reset camera"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <span className="text-xs text-dj-500 bg-dj-900 px-2 py-1 rounded-lg border border-dj-700">
            {analyzedTracks.length} tracks
          </span>
        </div>
      </div>

      <div className="flex-1 flex gap-4">
        <div ref={containerRef} className="flex-1 rounded-xl border border-dj-800 bg-dj-950 overflow-hidden relative" />

        {/* Hover tooltip panel */}
        {hoveredTrack && (
          <div className="w-64 bg-dj-900 rounded-xl border border-dj-800 p-4 space-y-3 shrink-0">
            <div>
              <h3 className="font-semibold text-dj-100 truncate">{hoveredTrack.title || 'Unknown'}</h3>
              <p className="text-xs text-dj-500">{hoveredTrack.artist || 'Unknown Artist'}</p>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-dj-500">Genre</span>
                <span className="text-dj-300">{hoveredTrack.genre || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dj-500">BPM</span>
                <span className="text-dj-300 font-mono">{Math.round(hoveredTrack.bpm || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dj-500">Key</span>
                <span className="text-dj-300 font-mono">{hoveredTrack.camelot_key || hoveredTrack.key || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dj-500">Energy</span>
                <span className="text-dj-300">{hoveredTrack.energy || '-'}/10</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dj-500">Danceability</span>
                <span className="text-dj-300">{hoveredTrack.danceability || '-'}/10</span>
              </div>
            </div>
            <p className="text-[10px] text-dj-600 flex items-center gap-1 mt-2">
              <MousePointer2 className="w-3 h-3" />
              Click to select
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
