import type { StagnationResult } from '@/lib/compliance'

interface Props {
  data: StagnationResult
}

export default function StagnationBadge({ data }: Props) {
  if (!data.detected) return null

  const exerciceList = data.plateaus.map(p => p.exercise).join(', ')

  return (
    <div className="flex items-start gap-2 rounded-lg bg-yellow-950 px-3 py-2.5 text-xs text-yellow-300">
      <span className="mt-px shrink-0">⟳</span>
      <span>
        <span className="font-semibold">Stagnation détectée</span>
        {' — '}{exerciceList}
      </span>
    </div>
  )
}
