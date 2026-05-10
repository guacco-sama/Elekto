import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useTrackStore } from '../stores/trackStore'

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

export default function ScatterMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const tracks = useTrackStore((s) => s.tracks)
  const analyzedTracks = tracks.filter((t) => t.bpm !== null)

  useEffect(() => {
    if (!containerRef.current || analyzedTracks.length === 0) return

    const container = containerRef.current
    const w = container.clientWidth
    const h = container.clientHeight

    // Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0a0f)

    // Camera
    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000)
    camera.position.set(12, 8, 12)

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.target.set(0, 5, 0)

    // Grid
    const grid = new THREE.GridHelper(20, 20, 0x1a1a2e, 0x12121a)
    scene.add(grid)

    // Axes helpers (subtle)
    const axes = new THREE.AxesHelper(1)
    axes.scale.set(0.5, 0.5, 0.5)
    scene.add(axes)

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
    analyzedTracks.forEach((track) => {
      const bpm = track.bpm || 128
      const energy = track.energy || 5
      const dance = track.danceability || 5

      // Map to 3D space: X = BPM, Y = Energy, Z = Danceability
      const x = ((bpm - minBpm) / (maxBpm - minBpm)) * 16 - 8
      const y = ((energy - minEnergy) / (maxEnergy - minEnergy)) * 10 + 0.5
      const z = ((dance - 1) / 9) * 16 - 8

      const color = getGenreColor(track.genre)
      const geometry = new THREE.SphereGeometry(0.25, 16, 16)
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

    // Raycaster for hover
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
      }

      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh
        hovered = hit
        const mat = hit.material as THREE.MeshStandardMaterial
        mat.emissiveIntensity = 1.0
        hit.scale.set(1.5, 1.5, 1.5)
      }
    }
    renderer.domElement.addEventListener('mousemove', onMouseMove)

    // Tooltip
    const tooltip = document.createElement('div')
    tooltip.style.cssText = `
      position: absolute; pointer-events: none; background: #1a1a2e;
      border: 1px solid #252542; border-radius: 8px; padding: 8px 12px;
      color: #e8e8f8; font-size: 12px; font-family: Inter, sans-serif;
      z-index: 10; display: none; box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    `
    container.appendChild(tooltip)

    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const intersects = raycaster.intersectObjects(points)

      if (intersects.length > 0) {
        const track = intersects[0].object.userData.track
        tooltip.style.display = 'block'
        tooltip.style.left = `${e.clientX - rect.left + 12}px`
        tooltip.style.top = `${e.clientY - rect.top - 12}px`
        tooltip.innerHTML = `
          <div class="font-semibold">${track.title || 'Unknown'}</div>
          <div class="text-dj-400">${track.artist || 'Unknown Artist'}</div>
          <div class="mt-1 text-xs text-dj-300">
            ${track.genre || ''}${track.sub_genre ? ' / ' + track.sub_genre : ''}<br/>
            BPM: ${Math.round(track.bpm || 0)} · Key: ${track.camelot_key || track.key || '-'}<br/>
            Energy: ${track.energy || '-'} · Dance: ${track.danceability || '-'}
          </div>
        `
      } else {
        tooltip.style.display = 'none'
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
      renderer.dispose()
      container.removeChild(renderer.domElement)
      if (tooltip.parentNode) container.removeChild(tooltip)
    }
  }, [analyzedTracks])

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
            X = BPM · Y = Energy · Z = Danceability · Color = Genre
          </p>
        </div>
        <div className="text-xs text-dj-500">
          {analyzedTracks.length} tracks visualized
        </div>
      </div>
      <div ref={containerRef} className="flex-1 rounded-xl border border-dj-800 bg-dj-950 overflow-hidden" />
    </div>
  )
}
