import { createClient } from '@/lib/supabase/server'
import { format, subDays, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { computeAlerts, computeE1rmTrends, computeFatigueScore } from '@/lib/dashboard'
import {
  computeCompliance,
  computeWeeklyCompliance,
  computeStagnation,
  computeOverreachingSignal,
} from '@/lib/compliance'
import {
  computeAcuteChronicRatios,
  computeRCXL,
  computeMonotonyStrain,
  computeVolumeLandmarks,
  type SessionLite,
  type SetLite,
} from '@/lib/load-management'
import type { DailyTracker, Set as SetRow, Session } from '@/types/database'
import ProfilAthleteCharts from '@/components/coach/ProfilAthleteCharts'
import ComplianceCard from '@/components/coach/ComplianceCard'
import StagnationBadge from '@/components/coach/StagnationBadge'
import OverreachingBadge from '@/components/coach/OverreachingBadge'
import WeeklyComplianceChart from '@/components/coach/WeeklyComplianceChart'
import AcuteChronicCard from '@/components/coach/AcuteChronicCard'
import MonotonyStrainBadge from '@/components/coach/MonotonyStrainBadge'
import VolumeLandmarksCard from '@/components/coach/VolumeLandmarksCard'

export default async function AthleteDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const from30 = format(subDays(new Date(), 30), 'yyyy-MM-dd')
  const from28 = format(subDays(new Date(), 28), 'yyyy-MM-dd')
  const from70 = format(subDays(new Date(), 70), 'yyyy-MM-dd')

  const [{ data: trackers }, { data: sessions30 }, { data: sessions70 }] = await Promise.all([
    supabase.from('daily_trackers').select('*').eq('athlete_id', id).gte('date', from30).order('date', { ascending: false }),
    supabase.from('sessions').select('id, athlete_id, scheduled_date, status, coach_id, block_id, week_in_block, session_number, notes_coach, notes_athlete, bodyweight_kg, duration_min, session_feel, created_at, completed_at').eq('athlete_id', id).gte('scheduled_date', from28).order('scheduled_date', { ascending: false }),
    supabase.from('sessions').select('id, scheduled_date').eq('athlete_id', id).gte('scheduled_date', from70).order('scheduled_date', { ascending: false }),
  ])

  const sessionIds = (sessions30 ?? []).map(s => s.id)
  const sessionIds70 = (sessions70 ?? []).map(s => s.id)

  const [{ data: sets30 }, { data: sets70 }] = await Promise.all([
    sessionIds.length
      ? supabase.from('sets').select('*').in('session_id', sessionIds)
      : Promise.resolve({ data: [] }),
    sessionIds70.length
      ? supabase.from('sets').select('session_id, exercise_name, set_number, weight_actual_kg, reps_actual, e1rm_kg').in('session_id', sessionIds70)
      : Promise.resolve({ data: [] }),
  ])

  const allTrackers = (trackers ?? []) as DailyTracker[]
  const allSessions = (sessions30 ?? []) as Session[]
  const allSets = (sets30 ?? []) as SetRow[]
  const sessions70Full = (sessions70 ?? []) as SessionLite[]
  const sets70Full = (sets70 ?? []) as SetLite[]

  // Existing dashboard data
  const alerts = computeAlerts(allTrackers)
  const e1rmTrends = computeE1rmTrends(allSets)
  const fatigueScore = computeFatigueScore(allTrackers)

  // Compliance chapter 4
  const compliance = computeCompliance(allSessions, allSets)
  const weeklyCompliance = computeWeeklyCompliance(allSessions, allSets)
  const stagnation = computeStagnation(allSets)
  const overreaching = computeOverreachingSignal(allTrackers, allSets)

  // Gestion de charge (METRICS_REFERENCE.md — A:C, rCXL, Monotonie/Strain, Volume Landmarks)
  const acuteChronic = computeAcuteChronicRatios(allSessions, allSets)
  const rcxl = computeRCXL(allSessions, allSets)
  const monotonyStrain = computeMonotonyStrain(allSessions, allSets)
  const volumeLandmarks = computeVolumeLandmarks(sessions70Full, sets70Full)

  const bodyweightData = allTrackers
    .filter(t => t.bodyweight_kg != null)
    .slice(0, 30)
    .reverse()
    .map(t => ({ date: format(parseISO(t.date), 'd MMM', { locale: fr }), kg: t.bodyweight_kg }))

  const hasSignals = stagnation.detected || overreaching.detected

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* e1RM */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="mb-4 text-xs uppercase tracking-wider text-zinc-400">e1RM estimés (4 sem.)</h2>
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
                {t.effectSize != null && (
                  <div className="mt-0.5 text-[10px] text-zinc-600">Δ {t.effectSize}</div>
                )}
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

      {/* Compliance + signaux */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ComplianceCard data={compliance} />
        <WeeklyComplianceChart data={weeklyCompliance} />
      </div>

      {hasSignals && (
        <div className="space-y-2">
          <StagnationBadge data={stagnation} />
          <OverreachingBadge data={overreaching} />
        </div>
      )}

      {/* Gestion de charge */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <AcuteChronicCard data={acuteChronic} rcxl={rcxl} />
        <VolumeLandmarksCard data={volumeLandmarks} />
      </div>

      <MonotonyStrainBadge data={monotonyStrain} />

      {bodyweightData.length > 1 && <ProfilAthleteCharts bodyweightData={bodyweightData} trackers={allTrackers} />}
    </div>
  )
}
