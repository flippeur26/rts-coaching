import { createClient } from '@/lib/supabase/server'
import { subDays, format } from 'date-fns'
import {
  computeAlerts, computeAthleteStatus, computeE1rmTrends,
  computeFatigueScore, latestBodyweight,
  type AlertLevel,
} from '@/lib/dashboard'
import type { DailyTracker, Set } from '@/types/database'
import { CriticalAlertsWidget } from '@/components/coach/CriticalAlertsWidget'

interface AthleteCard {
  id: string
  full_name: string
  email: string
  status: AlertLevel
  alerts: ReturnType<typeof computeAlerts>
  e1rmTrends: ReturnType<typeof computeE1rmTrends>
  fatigueScore: number | null
  bodyweight: number | null
  lastSessionDate: string | null
}

export default async function CoachDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: relations } = await supabase
    .from('coach_athlete')
    .select('athlete_id, profiles!coach_athlete_athlete_id_fkey(id, full_name, email)')
    .eq('coach_id', user!.id)
    .eq('status', 'accepted')

  if (!relations || relations.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Dashboard</h1>
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg">Aucun athlète pour l&apos;instant.</p>
          <p className="text-sm mt-2">
            Allez dans{' '}
            <a href="/coach/athletes" className="text-orange-500 hover:underline">Gestion athlètes</a>
            {' '}pour en ajouter.
          </p>
        </div>
      </div>
    )
  }

  const athleteIds = relations.map(r => r.athlete_id)
  const from30 = format(subDays(new Date(), 30), 'yyyy-MM-dd')
  const from14 = format(subDays(new Date(), 14), 'yyyy-MM-dd')

  // Charger trackers et sets pour tous les athlètes en parallèle
  const [{ data: allTrackers }, { data: allSessions }, { data: allSets }] = await Promise.all([
    supabase
      .from('daily_trackers')
      .select('*')
      .in('athlete_id', athleteIds)
      .gte('date', from30)
      .order('date', { ascending: false }),
    supabase
      .from('sessions')
      .select('athlete_id, scheduled_date, status')
      .in('athlete_id', athleteIds)
      .eq('status', 'completed')
      .order('scheduled_date', { ascending: false }),
    supabase
      .from('sets')
      .select('*')
      .in('session_id',
        // sous-requête simulée : on passe par les sessions récentes
        (await supabase
          .from('sessions')
          .select('id')
          .in('athlete_id', athleteIds)
          .gte('scheduled_date', from14)
        ).data?.map(s => s.id) ?? []
      )
      .not('e1rm_kg', 'is', null),
  ])

  const cards: AthleteCard[] = relations.map(rel => {
    const profile = rel.profiles as { id: string; full_name: string; email: string } | null
    if (!profile) return null

    const trackers = (allTrackers ?? []).filter(t => t.athlete_id === rel.athlete_id) as DailyTracker[]
    const athleteSets = (allSets ?? []) as Set[]
    // Note: on ne peut pas filtrer ici par athlete_id (les sets n'en ont pas).
    // Le filtrage par session se fait dans buildAthleteCards.

    // Filtrer les sets de cet athlète via les sessions
    const athleteSessionIds = new Set(
      (allSessions ?? [])
        .filter(s => s.athlete_id === rel.athlete_id)
        .map(s => (s as { athlete_id: string; scheduled_date: string; status: string; id?: string }).id)
        .filter(Boolean)
    )
    const filteredSets = athleteSets.filter(s => athleteSessionIds.has(s.session_id))

    const alerts = computeAlerts(trackers)
    const status = computeAthleteStatus(alerts)
    const e1rmTrends = computeE1rmTrends(filteredSets)
    const fatigueScore = computeFatigueScore(trackers)
    const bodyweight = latestBodyweight(trackers)
    const lastSession = (allSessions ?? []).find(s => s.athlete_id === rel.athlete_id)
    const lastSessionDate = lastSession?.scheduled_date ?? null

    return {
      id: rel.athlete_id,
      full_name: profile.full_name,
      email: profile.email,
      status,
      alerts,
      e1rmTrends,
      fatigueScore,
      bodyweight,
      lastSessionDate,
    }
  }).filter(Boolean) as AthleteCard[]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">{cards.length} athlète(s) suivi(s)</p>
      </div>

      {/* Alertes critiques */}
      <CriticalAlertsWidget
        athletes={cards.map((c) => ({ id: c.id, name: c.full_name }))}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {cards.map(card => (
          <AthleteCardComponent key={card.id} card={card} />
        ))}
      </div>
    </div>
  )
}

function AthleteCardComponent({ card }: { card: AthleteCard }) {
  const statusDot: Record<AlertLevel, string> = {
    green: 'bg-green-500',
    orange: 'bg-orange-500',
    red: 'bg-red-500',
    gray: 'bg-gray-500',
  }

  const trendIcon = (trend: string) => {
    if (trend === 'up') return <span className="text-green-400 text-base">↑</span>
    if (trend === 'down') return <span className="text-red-400 text-base">↓</span>
    if (trend === 'stable') return <span className="text-gray-400 text-base">→</span>
    return <span className="text-gray-600 text-sm">—</span>
  }

  return (
    <a
      href={`/coach/athletes/${card.id}`}
      className="block bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-2xl p-5 transition-colors"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${statusDot[card.status]} shrink-0`} />
            <h2 className="font-semibold text-white">{card.full_name}</h2>
          </div>
          <p className="text-gray-500 text-xs mt-0.5 ml-4">
            {card.lastSessionDate
              ? `Dernière séance : ${format(new Date(card.lastSessionDate + 'T12:00:00'), 'd MMM')}`
              : 'Aucune séance'}
          </p>
        </div>
        {card.bodyweight != null && (
          <span className="text-gray-400 text-sm font-mono">{card.bodyweight} kg</span>
        )}
      </div>

      {/* e1RM */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {card.e1rmTrends.map(t => (
          <div key={t.lift} className="bg-gray-800 rounded-xl p-2.5 text-center">
            <div className="text-gray-500 text-xs mb-1">{t.lift}</div>
            <div className="flex items-center justify-center gap-1">
              <span className="text-white font-mono font-bold text-sm">
                {t.value != null ? `${t.value}kg` : '—'}
              </span>
              {trendIcon(t.trend)}
            </div>
          </div>
        ))}
      </div>

      {/* Score fatigue 7j */}
      {card.fatigueScore != null && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-gray-400 text-xs">Fatigue 7j :</span>
          <div className="flex-1 bg-gray-800 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all ${
                card.fatigueScore >= 4 ? 'bg-red-500' :
                card.fatigueScore >= 3 ? 'bg-orange-500' : 'bg-green-500'
              }`}
              style={{ width: `${(card.fatigueScore / 5) * 100}%` }}
            />
          </div>
          <span className={`text-xs font-mono font-semibold ${
            card.fatigueScore >= 4 ? 'text-red-400' :
            card.fatigueScore >= 3 ? 'text-orange-400' : 'text-green-400'
          }`}>
            {card.fatigueScore}/5
          </span>
        </div>
      )}

      {/* Alertes */}
      {card.alerts.length > 0 && (
        <div className="space-y-1">
          {card.alerts.map((alert, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${
                alert.level === 'red'
                  ? 'bg-red-950 text-red-300'
                  : 'bg-orange-950 text-orange-300'
              }`}
            >
              <span>{alert.level === 'red' ? '⚠' : '!'}</span>
              {alert.message}
            </div>
          ))}
        </div>
      )}
    </a>
  )
}
