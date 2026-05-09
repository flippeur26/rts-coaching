import type { OverreachingResult } from '@/lib/compliance'

interface Props {
  data: OverreachingResult
}

export default function OverreachingBadge({ data }: Props) {
  if (!data.detected) return null

  return (
    <div className="flex items-center gap-2 rounded-lg bg-red-950 px-3 py-2.5 text-xs text-red-300">
      <span className="shrink-0">⚠</span>
      <span>
        <span className="font-semibold">Risque overreaching</span>
        {' — '}CS↑ + e1RM↓ + fatigue↑ sur 2 sem.
      </span>
    </div>
  )
}
