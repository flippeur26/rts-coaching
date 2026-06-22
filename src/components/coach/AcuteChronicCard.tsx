import type { AcuteChronicResult, RcxlResult } from '@/lib/load-management'

interface Props {
  data: AcuteChronicResult[]
  rcxl: RcxlResult[]
}

const ZONE_LABEL: Record<NonNullable<AcuteChronicResult['zone']>, string> = {
  undertrained: 'Sous-entraîné',
  optimal: 'Optimal',
  attention: 'Attention',
  danger: 'Danger',
}

const ZONE_COLOR: Record<NonNullable<AcuteChronicResult['zone']>, string> = {
  undertrained: 'text-sky-400',
  optimal: 'text-emerald-400',
  attention: 'text-orange-400',
  danger: 'text-red-400',
}

const ZONE_BAR: Record<NonNullable<AcuteChronicResult['zone']>, string> = {
  undertrained: 'bg-sky-500',
  optimal: 'bg-emerald-500',
  attention: 'bg-orange-500',
  danger: 'bg-red-500',
}

export default function AcuteChronicCard({ data, rcxl }: Props) {
  const rcxlByLift = new Map(rcxl.map(r => [r.lift, r]))

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
      <h2 className="mb-4 text-xs uppercase tracking-wider text-zinc-400">Ratio charge aiguë:chronique</h2>

      <div className="space-y-3">
        {data.map(d => {
          const r = rcxlByLift.get(d.lift)
          return (
            <div key={d.lift}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm text-zinc-300">{d.lift}</span>
                {d.ratio != null ? (
                  <span className={`font-mono text-sm font-semibold ${ZONE_COLOR[d.zone!]}`}>
                    {d.ratio.toFixed(2)} · {ZONE_LABEL[d.zone!]}
                  </span>
                ) : (
                  <span className="font-mono text-sm text-zinc-600">—</span>
                )}
              </div>
              {d.ratio != null && (
                <div className="h-1.5 w-full rounded-full bg-zinc-800">
                  <div
                    className={`h-1.5 rounded-full ${ZONE_BAR[d.zone!]}`}
                    style={{ width: `${Math.min(100, (d.ratio / 2) * 100)}%` }}
                  />
                </div>
              )}
              {r?.rcxl != null && (
                <div className="mt-1 text-xs text-zinc-500">
                  rCXL {r.rcxl.toFixed(2)}
                  {r.zone === 'peak' && ' · pic d\'intensité'}
                  {r.zone === 'light' && ' · jour léger'}
                  <span className="ml-1 text-zinc-600">(estimation)</span>
                </div>
              )}
            </div>
          )
        })}
        {data.every(d => d.ratio == null) && (
          <p className="text-xs text-zinc-600">Pas assez d&apos;historique (28j requis)</p>
        )}
      </div>
    </div>
  )
}
