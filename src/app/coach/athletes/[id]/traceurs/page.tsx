import { createClient } from '@/lib/supabase/server'
import { format, subDays, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { DailyTracker } from '@/types/database'

/** Vue traceurs pour le coach : 60 derniers jours, lecture seule. */
export default async function AthleteTraceursPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const from = format(subDays(new Date(), 60), 'yyyy-MM-dd')

  const { data: trackers } = await supabase
    .from('daily_trackers')
    .select('*')
    .eq('athlete_id', id)
    .gte('date', from)
    .order('date', { ascending: false })

  const list = (trackers ?? []) as DailyTracker[]

  function avg(field: keyof DailyTracker, count = 7) {
    const recent = list.slice(0, count).map(t => t[field]).filter(v => typeof v === 'number') as number[]
    if (recent.length === 0) return null
    return recent.reduce((a, b) => a + b, 0) / recent.length
  }

  const avg7 = {
    fatigue: avg('general_fatigue'),
    motivation: avg('motivation'),
    recovery: avg('recovery'),
    sleep: avg('sleep_quality'),
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Traceurs</h1>
        <p className="text-sm text-zinc-500">60 derniers jours de fatigue / motivation / récupération / sommeil.</p>
      </div>

      {/* Moyennes 7 jours */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Fatigue 7j" value={avg7.fatigue?.toFixed(1) ?? '—'} suffix="/5" tone={avg7.fatigue && avg7.fatigue >= 4 ? 'bad' : 'ok'} />
        <Stat label="Motivation 7j" value={avg7.motivation?.toFixed(1) ?? '—'} suffix="/5" tone={avg7.motivation && avg7.motivation < 3 ? 'bad' : 'ok'} />
        <Stat label="Récup. 7j" value={avg7.recovery?.toFixed(1) ?? '—'} suffix="/5" tone={avg7.recovery && avg7.recovery < 3 ? 'bad' : 'ok'} />
        <Stat label="Sommeil 7j" value={avg7.sleep?.toFixed(1) ?? '—'} suffix="/10" tone={avg7.sleep && avg7.sleep < 5 ? 'bad' : 'ok'} />
      </div>

      {/* Table 60j */}
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-400">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-center">Fatigue</th>
                <th className="px-3 py-2 text-center">Motiv.</th>
                <th className="px-3 py-2 text-center">Récup.</th>
                <th className="px-3 py-2 text-center">Sommeil</th>
                <th className="px-3 py-2 text-center">Poids</th>
                <th className="px-3 py-2 text-left">Notes</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-zinc-500">
                    Aucun traceur sur les 60 derniers jours.
                  </td>
                </tr>
              ) : (
                list.map(t => (
                  <tr key={t.id} className="border-t border-zinc-800/60">
                    <td className="px-3 py-2 text-zinc-200">{format(parseISO(t.date), 'EEE d MMM', { locale: fr })}</td>
                    <td className="px-3 py-2 text-center font-mono">{t.general_fatigue ?? '—'}</td>
                    <td className="px-3 py-2 text-center font-mono">{t.motivation ?? '—'}</td>
                    <td className="px-3 py-2 text-center font-mono">{t.recovery ?? '—'}</td>
                    <td className="px-3 py-2 text-center font-mono">{t.sleep_quality ?? '—'}</td>
                    <td className="px-3 py-2 text-center font-mono">{t.bodyweight_kg ?? '—'}</td>
                    <td className="px-3 py-2 text-zinc-500">{t.notes ?? ''}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, suffix, tone }: { label: string; value: string; suffix: string; tone: 'ok' | 'bad' }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-semibold ${tone === 'bad' ? 'text-orange-400' : 'text-white'}`}>
        {value}
        <span className="ml-1 text-sm text-zinc-500">{suffix}</span>
      </div>
    </div>
  )
}
