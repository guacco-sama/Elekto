import { useMemo } from 'react'

interface TrackSnapshot {
  id: number
  title: string | null
  energy: number | null
  bpm: number | null
  camelot_key: string | null
}

interface EnergyCurveProps {
  tracks: TrackSnapshot[]
  height?: number
}

export default function EnergyCurve({ tracks, height = 80 }: EnergyCurveProps) {
  const data = useMemo(() => {
    return tracks.map((t, i) => ({
      index: i,
      energy: t.energy ?? 5,
      bpm: t.bpm ?? 128,
      title: t.title || `Track ${i + 1}`,
      key: t.camelot_key || '--',
    }))
  }, [tracks])

  if (data.length < 2) return null

  const w = Math.max(data.length * 60, 300)
  const h = height
  const pad = { top: 10, right: 10, bottom: 20, left: 10 }
  const chartW = w - pad.left - pad.right
  const chartH = h - pad.top - pad.bottom

  const maxEnergy = 10
  const xStep = chartW / Math.max(data.length - 1, 1)

  // Energy line points
  const energyPoints = data.map((d, i) => {
    const x = pad.left + i * xStep
    const y = pad.top + chartH - (d.energy / maxEnergy) * chartH
    return `${x},${y}`
  }).join(' ')

  // Area under the curve
  const areaPath = `${pad.left},${pad.top + chartH} ${energyPoints} ${pad.left + (data.length - 1) * xStep},${pad.top + chartH}`

  // BPM as secondary line (normalized to 0-10 scale)
  const minBpm = Math.min(...data.map(d => d.bpm)) - 5
  const maxBpm = Math.max(...data.map(d => d.bpm)) + 5
  const bpmRange = maxBpm - minBpm || 1

  const bpmPoints = data.map((d, i) => {
    const x = pad.left + i * xStep
    const normalized = ((d.bpm - minBpm) / bpmRange) * maxEnergy
    const y = pad.top + chartH - (normalized / maxEnergy) * chartH
    return `${x},${y}`
  }).join(' ')

  return (
    <div className="w-full overflow-x-auto">
      <svg width={w} height={h} className="block">
        {/* Grid lines */}
        {[2, 4, 6, 8].map(level => {
          const y = pad.top + chartH - (level / maxEnergy) * chartH
          return (
            <line
              key={level}
              x1={pad.left}
              y1={y}
              x2={pad.left + chartW}
              y2={y}
              stroke="rgba(255,255,255,0.06)"
              strokeDasharray="3,3"
            />
          )
        })}

        {/* Energy area fill */}
        <polygon
          points={areaPath}
          fill="rgba(124,58,237,0.15)"
        />

        {/* Energy line */}
        <polyline
          points={energyPoints}
          fill="none"
          stroke="#7c3aed"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* BPM line */}
        <polyline
          points={bpmPoints}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={1.5}
          strokeDasharray="4,4"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.6}
        />

        {/* Track points with energy dots */}
        {data.map((d, i) => {
          const x = pad.left + i * xStep
          const y = pad.top + chartH - (d.energy / maxEnergy) * chartH
          return (
            <g key={i}>
              <circle
                cx={x}
                cy={y}
                r={4}
                fill="#7c3aed"
                stroke="#12121a"
                strokeWidth={2}
              />
              {/* Track number */}
              <text
                x={x}
                y={h - 4}
                textAnchor="middle"
                fill="#64748b"
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
              >
                {i + 1}
              </text>
            </g>
          )
        })}

        {/* Legend */}
        <g transform={`translate(${w - 120}, 12)`}>
          <circle cx={0} cy={0} r={3} fill="#7c3aed" />
          <text x={8} y={3} fill="#94a3b8" fontSize="9">Energy</text>
          <line x1={0} y1={14} x2={12} y2={14} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3,3" />
          <text x={18} y={17} fill="#94a3b8" fontSize="9">BPM</text>
        </g>
      </svg>
    </div>
  )
}
