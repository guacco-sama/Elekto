import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { useTrackStore } from '../stores/trackStore'
import { Play, Plus, Link2, Route, X } from 'lucide-react'

interface NodeData {
  id: number
  title: string
  artist: string
  genre: string | null
  bpm: number | null
  key: string | null
  energy: number | null
  x?: number
  y?: number
}

interface LinkData {
  source: number | NodeData
  target: number | NodeData
  strength: number
  harmonic: boolean
}

interface GraphEdge {
  source: number
  target: number
  weight: number
}

function findShortestPath(edges: GraphEdge[], startId: number, endId: number): number[] {
  // Build adjacency list
  const adj = new Map<number, { neighbor: number; weight: number }[]>()
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, [])
    if (!adj.has(e.target)) adj.set(e.target, [])
    adj.get(e.source)!.push({ neighbor: e.target, weight: e.weight })
    adj.get(e.target)!.push({ neighbor: e.source, weight: e.weight })
  }

  // Dijkstra's algorithm
  const dist = new Map<number, number>()
  const prev = new Map<number, number | null>()
  const unvisited = new Set<number>()

  for (const id of adj.keys()) {
    dist.set(id, id === startId ? 0 : Infinity)
    prev.set(id, null)
    unvisited.add(id)
  }

  while (unvisited.size > 0) {
    let current: number | null = null
    let minDist = Infinity
    for (const id of unvisited) {
      const d = dist.get(id) ?? Infinity
      if (d < minDist) {
        minDist = d
        current = id
      }
    }
    if (current === null || minDist === Infinity) break
    if (current === endId) break
    unvisited.delete(current)

    for (const { neighbor, weight } of adj.get(current) ?? []) {
      if (!unvisited.has(neighbor)) continue
      const alt = (dist.get(current) ?? Infinity) + weight
      if (alt < (dist.get(neighbor) ?? Infinity)) {
        dist.set(neighbor, alt)
        prev.set(neighbor, current)
      }
    }
  }

  // Reconstruct path
  const path: number[] = []
  let at: number | null = endId
  while (at !== null) {
    path.unshift(at)
    at = prev.get(at) ?? null
  }

  if (path[0] !== startId) return []
  return path
}

export default function GraphPlaylist() {
  const containerRef = useRef<HTMLDivElement>(null)
  const tracks = useTrackStore((s) => s.tracks)
  const analyzedTracks = tracks.filter((t) => t.bpm !== null)
  const [selectedNodes, setSelectedNodes] = useState<Set<number>>(new Set())
  const [pathNodes, setPathNodes] = useState<number[]>([])
  const [edgesRef] = useState<GraphEdge[]>([])

  useEffect(() => {
    if (!containerRef.current || analyzedTracks.length < 2) return

    const container = containerRef.current
    const w = container.clientWidth
    const h = container.clientHeight

    // Clear previous
    container.innerHTML = ''

    // Build nodes + edges
    const nodes: NodeData[] = analyzedTracks.map((t) => ({
      id: t.id,
      title: t.title || 'Unknown',
      artist: t.artist || 'Unknown',
      genre: t.genre,
      bpm: t.bpm,
      key: t.key,
      energy: t.energy,
    }))

    const links: LinkData[] = []
    const graphEdges: GraphEdge[] = []
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]
        const b = nodes[j]
        if (!a.bpm || !b.bpm || !a.key || !b.key) continue

        const bpmDiff = Math.abs(a.bpm - b.bpm)
        const energyDiff = Math.abs((a.energy || 5) - (b.energy || 5))
        const keyMatch = a.key === b.key
        const camelotA = parseInt(a.key?.replace(/[A-Za-z]/, '') || '8')
        const camelotB = parseInt(b.key?.replace(/[A-Za-z]/, '') || '8')
        const camelotDiff = Math.abs(camelotA - camelotB)
        const harmonic = keyMatch || camelotDiff <= 1 || camelotDiff === 11

        const bpmScore = 1 - Math.min(bpmDiff / 30, 1)
        const energyScore = 1 - energyDiff / 9
        const strength = (bpmScore * 0.4 + energyScore * 0.4 + (harmonic ? 0.2 : 0))

        if (strength > 0.5) {
          links.push({ source: a.id, target: b.id, strength, harmonic })
          // Weight is inverse of strength (lower weight = better path)
          graphEdges.push({ source: a.id, target: b.id, weight: 1.0 / (strength + 0.1) })
        }
      }
    }
    edgesRef.length = 0
    edgesRef.push(...graphEdges)

    // SVG
    const svg = d3.select(container)
      .append('svg')
      .attr('width', w)
      .attr('height', h)
      .attr('viewBox', [0, 0, w, h])

    // Zoom
    const g = svg.append('g')
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 4])
      .on('zoom', (e) => g.attr('transform', e.transform))
    svg.call(zoom as any)

    // Links
    const linkSel = g.selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', (d: LinkData) => d.harmonic ? '#7c3aed' : '#35355a')
      .attr('stroke-opacity', (d: LinkData) => d.strength * 0.6)
      .attr('stroke-width', (d: LinkData) => d.strength * 3)

    // Path highlighting links
    const pathLinkSel = g.selectAll('line.path-link')
      .data(links.filter(l => {
        const s = typeof l.source === 'number' ? l.source : l.source.id
        const t = typeof l.target === 'number' ? l.target : l.target.id
        const pathSet = new Set(pathNodes)
        if (!pathSet.has(s) || !pathSet.has(t)) return false
        // Consecutive in path
        for (let i = 0; i < pathNodes.length - 1; i++) {
          if ((pathNodes[i] === s && pathNodes[i + 1] === t) ||
              (pathNodes[i] === t && pathNodes[i + 1] === s)) return true
        }
        return false
      }))
      .join('line')
      .attr('stroke', '#22c55e')
      .attr('stroke-opacity', 1)
      .attr('stroke-width', 4)

    // Nodes
    const nodeSel = g.selectAll<SVGCircleElement, NodeData>('circle')
      .data(nodes)
      .join('circle')
      .attr('r', (d: NodeData) => 6 + (d.energy || 5) * 0.5)
      .attr('fill', (d: NodeData) => {
        if (pathNodes.includes(d.id)) return '#22c55e'
        if (d.genre?.includes('Drum')) return '#ff3333'
        if (d.genre?.includes('Dubstep')) return '#ff6600'
        if (d.genre?.includes('Techno')) return '#00ccff'
        if (d.genre?.includes('Trance')) return '#9966ff'
        if (d.genre?.includes('House')) return '#33ff66'
        if (d.genre?.includes('Trap')) return '#ffaa00'
        if (d.genre?.includes('Hip-Hop')) return '#ffcc00'
        if (d.genre?.includes('Ambient')) return '#8888ff'
        return '#6a6a9a'
      })
      .attr('stroke', (d: NodeData) => selectedNodes.has(d.id) ? '#e8e8f8' : '#12121a')
      .attr('stroke-width', (d: NodeData) => selectedNodes.has(d.id) ? 3 : 2)
      .style('cursor', 'pointer')
      .on('click', (_event: any, d: NodeData) => {
        setSelectedNodes((prev) => {
          const next = new Set(prev)
          if (next.has(d.id)) next.delete(d.id)
          else next.add(d.id)
          return next
        })
      })

    // Labels
    const labelSel = g.selectAll<SVGTextElement, NodeData>('text')
      .data(nodes)
      .join('text')
      .text((d: NodeData) => d.title.substring(0, 20))
      .attr('font-size', 10)
      .attr('fill', '#aaaaca')
      .attr('dx', 10)
      .attr('dy', 4)
      .style('pointer-events', 'none')
      .style('opacity', (d: NodeData) => selectedNodes.has(d.id) || pathNodes.includes(d.id) ? 1 : 0)

    // Simulation
    const sim = d3.forceSimulation<NodeData>(nodes)
      .force('link', d3.forceLink<NodeData, LinkData>(links).id((d: NodeData) => d.id).distance(80).strength((d: LinkData) => d.strength))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force('collision', d3.forceCollide().radius(20))
      .on('tick', () => {
        linkSel
          .attr('x1', (d: any) => (d.source as NodeData).x!)
          .attr('y1', (d: any) => (d.source as NodeData).y!)
          .attr('x2', (d: any) => (d.target as NodeData).x!)
          .attr('y2', (d: any) => (d.target as NodeData).y!)

        pathLinkSel
          .attr('x1', (d: any) => (d.source as NodeData).x!)
          .attr('y1', (d: any) => (d.source as NodeData).y!)
          .attr('x2', (d: any) => (d.target as NodeData).x!)
          .attr('y2', (d: any) => (d.target as NodeData).y!)

        nodeSel
          .attr('cx', (d: NodeData) => d.x!)
          .attr('cy', (d: NodeData) => d.y!)

        labelSel
          .attr('x', (d: NodeData) => d.x!)
          .attr('y', (d: NodeData) => d.y!)
      })

    return () => {
      sim.stop()
      svg.call(zoom.on('zoom', null) as any)
      container.innerHTML = ''
    }
  }, [analyzedTracks, selectedNodes, pathNodes, edgesRef])

  const selectedTracks = analyzedTracks.filter((t) => selectedNodes.has(t.id))
  const pathTracks = analyzedTracks.filter((t) => pathNodes.includes(t.id))

  const handleFindPath = useCallback(() => {
    if (selectedNodes.size !== 2) return
    const [a, b] = Array.from(selectedNodes)
    const path = findShortestPath(edgesRef, a, b)
    setPathNodes(path)
  }, [selectedNodes, edgesRef])

  const handleClearPath = useCallback(() => {
    setPathNodes([])
  }, [])

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-dj-50">Graph Playlist</h2>
          <p className="text-sm text-dj-400">
            Nodes = tracks · Edges = compatibility (BPM, energy, harmonic key)
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedNodes.size === 2 && !pathNodes.length && (
            <button
              onClick={handleFindPath}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs rounded-lg transition-colors"
            >
              <Route className="w-3.5 h-3.5" />
              Find Path
            </button>
          )}
          {pathNodes.length > 0 && (
            <button
              onClick={handleClearPath}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-dj-800 hover:bg-dj-700 text-dj-300 text-xs rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Clear Path
            </button>
          )}
          {selectedTracks.length > 0 && (
            <span className="text-xs text-dj-accent bg-dj-accent/10 px-2 py-1 rounded">
              {selectedTracks.length} selected
            </span>
          )}
          <div className="text-xs text-dj-500">
            {analyzedTracks.length} tracks
          </div>
        </div>
      </div>

      {analyzedTracks.length < 2 ? (
        <div className="flex-1 flex items-center justify-center text-dj-500">
          <div className="text-center">
            <p className="text-lg mb-2">Need more tracks</p>
            <p className="text-sm">Analyze at least 2 tracks to build the compatibility graph</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex gap-4">
          <div ref={containerRef} className="flex-1 rounded-xl border border-dj-800 bg-dj-950 overflow-hidden" />

          {/* Side panel */}
          {(selectedTracks.length > 0 || pathTracks.length > 0) && (
            <div className="w-72 bg-dj-900 rounded-xl border border-dj-800 p-4 overflow-auto shrink-0">
              {pathTracks.length > 0 ? (
                <>
                  <h3 className="text-sm font-semibold text-dj-200 mb-3 flex items-center gap-2">
                    <Route className="w-4 h-4 text-green-400" />
                    Transition Path
                  </h3>
                  <div className="space-y-2">
                    {pathTracks.map((t, i) => (
                      <div
                        key={t.id}
                        className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20"
                      >
                        <span className="text-xs text-green-400 font-mono w-5">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-dj-100 truncate">{t.title || 'Unknown'}</p>
                          <p className="text-xs text-dj-500 truncate">{t.artist || 'Unknown'}</p>
                        </div>
                        <span className="text-xs text-dj-400 font-mono">
                          {Math.round(t.bpm || 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-dj-600 mt-2">{pathTracks.length} tracks in transition path</p>
                </>
              ) : (
                <>
                  <h3 className="text-sm font-semibold text-dj-200 mb-3 flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-dj-accent" />
                    Selected Playlist
                  </h3>
                  <div className="space-y-2">
                    {selectedTracks.map((t, i) => (
                      <div
                        key={t.id}
                        className="flex items-center gap-2 p-2 rounded-lg bg-dj-800/50 hover:bg-dj-800 transition-colors"
                      >
                        <span className="text-xs text-dj-500 font-mono w-5">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-dj-100 truncate">{t.title || 'Unknown'}</p>
                          <p className="text-xs text-dj-500 truncate">{t.artist || 'Unknown'}</p>
                        </div>
                        <span className="text-xs text-dj-400 font-mono">
                          {Math.round(t.bpm || 0)} BPM
                        </span>
                      </div>
                    ))}
                  </div>
                  {selectedNodes.size === 2 && (
                    <p className="text-[10px] text-dj-500 mt-2">
                      Click "Find Path" to discover the best transition between these tracks.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
