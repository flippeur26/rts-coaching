import { createClient } from '@/lib/supabase/server'
import { format, subDays, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { computeAlerts, computeE1rmTrends, computeFatigueScore } from '@/lib/dashboard'
import type { DailyTracker, Set as SetRow } from '@/types/database'
import ProfilAthleteCharts from '@/components/coach/ProfilAthleteCharts'

/**
 * Dashboard scopé à l'athlète : e1RM, alertes, score fatigue, graphes traceurs/poids.
 * (Auparavant intégré dans la page Profil, maintenant on l'isole pour clarifier.)
 */
export default async function AthleteDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const from30 = format(subDays(new Date(), 30), 'yyyy-MM-dd')
  const from14 = format(subDays(new Date(), 14), 'yyyy-MM-dd')

  const [{ data: trackers }, { data: recentSessions }] = await Promise.all([
    supabase.from('daily_trackers').select('*').eq('athlete_id', id).gte('date', from30).order('date', { ascending: false }),
    supabase.from('sessions').select('id, scheduled_date').eq('athlete_id', id).gte('scheduled_date', from14).order('scheduled_date', { ascending: false }),
  ])

  const recentSessionIds = (recentSessions ?? []).map(s => s.id)
  const { data: recentSets } = recentSessionIds.length
    ? await supabase.from('sets').select('*').in('session_id', recentSessionIds).not('e1rm_kg', 'is', null)
    : { data: [] }

  const allTrackers = (trackers ?? []) as DailyTracker[]
  const allSets = (recentSets ?? []) as SetRow[]

  const alerts = computeAlerts(allTrackers)
  const e1rmTrends = computeE1rmTrends(allSets)
  const fatigueScore = computeFatigueScore(allTrackers)

  const bodyweightData = allTrackers
    .filter(t => t.bodyweight_kg != null)
    .slice(0, 30)
    .reverse()
    .map(t => ({ date: format(parseISO(t.date), 'd MMM', { locale: fr }), kg: t.bodyweight_kg }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* e1RM */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="mb-4 text-xs uppercase tracking-wider text-zinc-400">e1RM estimés (2 sem.)</h2>
          <div className="grid grid-cols-3 gap-3">
            {e1rmTrends.map(t => (
              <div key={t.lift} className="text-center">
                <div className="mb-1 text-xs text-zinc-500">{t.lift}</div>
                <div className="font-mono text-xl font-bold text-white">{t.value != null ? t.value : '—'}</div>
                {t.value != null && <div className="text-xs text-zinc-400">kg</div>}
                <div className="mt-1 text-lg">
                  {t.trend === 'up' ? <span className="text-emerald-400">↑</span> :
                   t.trend === 'down' ? <span className="text-red-400">↓</span> :
                   t.trend === 'stable' ? <span className="text-zinc-500">→</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* État actuel */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="mb-3 text-xs uppercase tracking-wider text-zinc-400">État actuel</h2>
          {fatigueScore != null && (
            <div className="mb-3 flex items-center gap-3">
              <span className="text-sm text-zinc-400">Fatigue 7j</span>
              <div className="h-2 flex-1 rounded-full bg-zinc-800">
                <div
                  className={`h-2 rounded-full ${fatigueScore >= 4 ? 'bg-red-500' : fatigueScore >= 3 ? 'bg-orange-500' : 'bg-emerald-500'}`}
                  style={{ width: `${(fatigueScore / 5) * 100}%` }}
                />
              </div>
              <span className="font-mono text-sm font-semibold text-white">{fatigueScore}/5</span>
            </div>
          )}
          {alerts.length === 0 ? (
            <p className="text-sm text-emerald-400">Aucune alerte active</p>
          ) : (
            <div className="space-y-1.5">
              {alerts.map((a, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs ${
                    a.level === 'red' ? 'bg-red-950 text-red-300' : 'bg-orange-950 text-orange-300'
                  }`}
                >
                  <span>{a.level === 'red' ? '⚠' : '!'}</span>
                  {a.message}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {bodyweightData.length > 1 && <ProfilAthleteCharts bodyweightData={bodyweightData} trackers={allTrackers} />}
    </div>
  )
}
