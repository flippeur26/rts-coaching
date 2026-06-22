import type { MonotonyStrainResult } from '@/lib/load-management'

interface Props {
  data: MonotonyStrainResult
}

export default function MonotonyStrainBadge({ data }: Props) {
  if (data.monotony == null || data.zone == null || data.daysOfData < 4) return null

  const styles =
    data.zone === 'good' ? 'bg-emerald-950 text-emerald-300' :
    data.zone === 'attention' ? 'bg-orange-950 text-orange-300' :
    'bg-red-950 text-red-300'

  const message =
    data.zone === 'good' ? 'Bonne variation journalière' :
    data.zone === 'attention' ? 'Variation journalière faible — surveiller' :
    'Manque de variation — insérer une séance légère'

  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs ${styles}`}>
      <span className="shrink-0">{data.zone === 'good' ? '◷' : '⚠'}</span>
      <span>
        <span className="font-semibold">Monotonie {data.monotony.toFixed(2)}</span>
        {' · Strain '}{Math.round(data.strain!)}
        {' — '}{message}
      </span>
    </div>
  )
}
