import type { VolumeLandmarksResult } from '@/lib/load-management'

interface Props {
  data: VolumeLandmarksResult[]
}

const CONFIDENCE_LABEL: Record<VolumeLandmarksResult['confidence'], string> = {
  low: 'Estimation générique',
  medium: 'Estimation individuelle',
  high: 'Estimation fiable',
}

const CONFIDENCE_COLOR: Record<VolumeLandmarksResult['confidence'], string> = {
  low: 'text-zinc-500',
  medium: 'text-orange-400',
  high: 'text-emerald-400',
}

export default function VolumeLandmarksCard({ data }: Props) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
      <h2 className="mb-4 text-xs uppercase tracking-wider text-zinc-400">Repères de volume (MEV / MAV / MRV)</h2>

      <div className="space-y-4">
        {data.map(d => {
          const mrv = d.mrv ?? 1
          const pct = (v: number) => `${Math.min(100, (v / mrv) * 100)}%`

          return (
            <div key={d.lift}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm text-zinc-300">{d.lift}</span>
                <span className="font-mono text-sm font-semibold text-white">{d.currentWeekSets} sets/sem.</span>
              </div>

              <div className="relative h-2 w-full rounded-full bg-zinc-800">
                {d.mev != null && <div className="absolute h-2 w-px bg-zinc-600" style={{ left: pct(d.mev) }} />}
                {d.mav != null && <div className="absolute h-2 w-px bg-zinc-600" style={{ left: pct(d.mav) }} />}
                <div
                  className="h-2 rounded-full bg-sky-500"
                  style={{ width: pct(Math.min(d.currentWeekSets, mrv)) }}
                />
              </div>

              <div className="mt-1 flex items-center justify-between text-xs text-zinc-600">
                <span>
                  MEV {d.mev ?? '—'} · MAV {d.mav ?? '—'} · MRV {d.mrv ?? '—'}
                  {d.normalizedVolume != null && <> · NV {Math.round(d.normalizedVolume)}</>}
                </span>
                <span className={CONFIDENCE_COLOR[d.confidence]}>{CONFIDENCE_LABEL[d.confidence]}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
