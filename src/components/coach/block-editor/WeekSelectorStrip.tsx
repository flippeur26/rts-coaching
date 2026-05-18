'use client'

interface Props {
  totalWeeks: number
  active: number
  onChange: (week: number) => void
}

export default function WeekSelectorStrip({ totalWeeks, active, onChange }: Props) {
  const weeks = Array.from({ length: Math.max(totalWeeks, 1) }, (_, i) => i + 1)
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2">
      <span className="mr-2 text-[10px] uppercase tracking-wider text-zinc-500">Semaine</span>
      {weeks.map(w => {
        const isActive = w === active
        return (
          <button
            key={w}
            onClick={() => onChange(w)}
            className={`min-w-[44px] rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? 'border-orange-500/60 bg-orange-500/10 text-orange-300'
                : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800'
            }`}
            aria-pressed={isActive}
            aria-label={`Semaine ${w}`}
          >
            S{w}
            {w === 1 && <span className="ml-1 text-[9px] uppercase text-orange-400/80">tpl</span>}
          </button>
        )
      })}
    </div>
  )
}
