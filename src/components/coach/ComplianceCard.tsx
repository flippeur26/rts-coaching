import type { ComplianceData } from '@/lib/compliance'

interface Props {
  data: ComplianceData
}

export default function ComplianceCard({ data }: Props) {
  const { sessions_done_pct, sessions_done, sessions_total, weight_compliance_pct, reps_compliance_pct, avg_rpe_realization_pct } = data

  const sessionColor =
    sessions_done_pct >= 80 ? 'text-emerald-400' :
    sessions_done_pct >= 60 ? 'text-orange-400' :
    'text-red-400'

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
      <h2 className="mb-4 text-xs uppercase tracking-wider text-zinc-400">Compliance 30j</h2>

      <div className="mb-4 flex items-baseline gap-2">
        <span className={`font-mono text-3xl font-bold ${sessionColor}`}>{sessions_done_pct}%</span>
        <span className="text-sm text-zinc-500">{sessions_done}/{sessions_total} séances</span>
      </div>

      <div className="space-y-2">
        {weight_compliance_pct != null && (
          <MetricRow label="Poids respecté" value={weight_compliance_pct} type="pct" />
        )}
        {reps_compliance_pct != null && (
          <MetricRow label="Reps respectées" value={reps_compliance_pct} type="pct" />
        )}
        {avg_rpe_realization_pct != null && (
          <MetricRow label="RPE réalisation moy." value={avg_rpe_realization_pct} type="rpe" />
        )}
        {weight_compliance_pct == null && reps_compliance_pct == null && avg_rpe_realization_pct == null && (
          <p className="text-xs text-zinc-600">Pas assez de données</p>
        )}
      </div>
    </div>
  )
}

function MetricRow({ label, value, type }: { label: string; value: number; type: 'pct' | 'rpe' }) {
  const color = type === 'pct'
    ? value >= 80 ? 'text-emerald-400' : value >= 60 ? 'text-orange-400' : 'text-red-400'
    : value >= 95 && value <= 105 ? 'text-emerald-400' : value >= 85 && value <= 115 ? 'text-orange-400' : 'text-red-400'

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={`font-mono text-sm font-semibold ${color}`}>{value}%</span>
    </div>
  )
}
