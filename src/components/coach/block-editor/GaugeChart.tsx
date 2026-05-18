'use client'

/**
 * GaugeChart — jauge type compteur de vitesse (arc 150° centré en haut).
 *
 * Affiche `value` sur un arc allant de `min` (gauche) à `max` (droite). Pas de zones
 * colorées : un seul arc orange qui se remplit, virage en rouge si `value > max`.
 *
 * Si `fallback === true`, l'arc de fond passe en pointillés (repères provisoires).
 */

import type { CSSProperties } from 'react'

interface GaugeChartProps {
  label: string
  value: number
  min: number
  max: number
  unit?: string
  formatValue?: (v: number) => string
  formatBound?: (v: number) => string
  fallback?: boolean
}

// Géométrie SVG (viewBox 200×130, centre (100, 110), rayon 80, balayage 150°)
const CX = 100
const CY = 110
const R = 80
const SWEEP_DEG = 150
const HALF_SWEEP = SWEEP_DEG / 2

function polar(angleDeg: number, radius = R) {
  const a = (angleDeg * Math.PI) / 180
  return { x: CX + radius * Math.sin(a), y: CY - radius * Math.cos(a) }
}

const LEFT = polar(-HALF_SWEEP)
const RIGHT = polar(HALF_SWEEP)
const ARC_PATH = `M ${LEFT.x.toFixed(2)} ${LEFT.y.toFixed(2)} A ${R} ${R} 0 0 1 ${RIGHT.x.toFixed(2)} ${RIGHT.y.toFixed(2)}`
const ARC_LEN = 2 * Math.PI * R * (SWEEP_DEG / 360)

function defaultFormat(v: number): string {
  if (!isFinite(v)) return '—'
  if (v === 0) return '0'
  const abs = Math.abs(v)
  if (abs >= 1000) return `${(v / 1000).toFixed(1)}k`
  if (abs >= 10) return v.toFixed(0)
  return v.toFixed(1)
}

export default function GaugeChart({
  label,
  value,
  min,
  max,
  unit,
  formatValue = defaultFormat,
  formatBound = defaultFormat,
  fallback = false,
}: GaugeChartProps) {
  const span = max - min
  const hasValidRange = span > 0 && isFinite(min) && isFinite(max)
  const rawT = hasValidRange ? (value - min) / span : 0
  const t = Math.max(0, Math.min(1, rawT))
  const overshoot = hasValidRange && value > max
  const undershoot = hasValidRange && value < min
  const angle = -HALF_SWEEP + t * SWEEP_DEG
  const needleTip = polar(angle, R - 6)

  const dashOffset = ARC_LEN * (1 - t)

  const fillColor = overshoot ? '#ef4444' : '#f97316' // red-500 / orange-500
  const bgDash = fallback ? '3 4' : 'none'

  const titleAttr = fallback ? 'Repères provisoires (historique insuffisant)' : undefined

  return (
    <div
      className="flex flex-col items-center rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2"
      title={titleAttr}
    >
      <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-400">{label}</div>

      <svg viewBox="0 0 200 130" className="w-full max-w-[220px]">
        {/* Arc de fond */}
        <path
          d={ARC_PATH}
          fill="none"
          stroke="#27272a"
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={bgDash}
        />
        {/* Arc de remplissage proportionnel à t */}
        {hasValidRange && !undershoot && (
          <path
            d={ARC_PATH}
            fill="none"
            stroke={fillColor}
            strokeWidth={10}
            strokeLinecap="round"
            style={{ strokeDasharray: ARC_LEN, strokeDashoffset: dashOffset } as CSSProperties}
          />
        )}
        {/* Aiguille */}
        {hasValidRange && (
          <>
            <line
              x1={CX}
              y1={CY}
              x2={needleTip.x}
              y2={needleTip.y}
              stroke="#fafafa"
              strokeWidth={2}
              strokeLinecap="round"
            />
            <circle cx={CX} cy={CY} r={4} fill="#fafafa" />
          </>
        )}

        {/* Valeur centrale */}
        <text
          x={CX}
          y={CY - 15}
          textAnchor="middle"
          fontSize="22"
          fontFamily="ui-monospace, monospace"
          fontWeight="700"
          fill="#fafafa"
        >
          {formatValue(value)}
        </text>
        {unit && (
          <text
            x={CX}
            y={CY - 2}
            textAnchor="middle"
            fontSize="9"
            fill="#71717a"
          >
            {unit}
          </text>
        )}

        {/* Labels min / max */}
        <text x={LEFT.x - 4} y={LEFT.y + 14} textAnchor="end" fontSize="9" fill="#a1a1aa" fontFamily="ui-monospace, monospace">
          {formatBound(min)}
          {undershoot && <tspan dx="2" fill="#ef4444">↓</tspan>}
        </text>
        <text x={RIGHT.x + 4} y={RIGHT.y + 14} textAnchor="start" fontSize="9" fill="#a1a1aa" fontFamily="ui-monospace, monospace">
          {formatBound(max)}
          {overshoot && <tspan dx="2" fill="#ef4444">↑</tspan>}
        </text>
      </svg>

      {fallback && (
        <div className="mt-0.5 text-[9px] italic text-zinc-600">repères provisoires</div>
      )}
    </div>
  )
}
