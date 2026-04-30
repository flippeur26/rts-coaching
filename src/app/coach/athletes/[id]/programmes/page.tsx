/* eslint-disable react/no-unescaped-entities */
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

interface ProgrammeData {
  id: string
  name: string
  type: string
  start_date: string
  end_date: string | null
  sessions_count: number
  completed_sessions: number
  sets_total: number
  performance_alerts: Array<{
    exercise_name: string
    type: string
    prescribed: number | null
    actual: number | null
    level: string
    message: string
  }>
}

export default async function AthleteProgemmesPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Vérifier que l'athlète appartient au coach (lien accepté)
  const { data: rel } = await supabase
    .from('coach_athlete')
    .select('athlete_id, profiles!coach_athlete_athlete_id_fkey(id, full_name)')
    .eq('coach_id', user!.id)
    .eq('athlete_id', params.id)
    .eq('status', 'accepted')
    .single()

  if (!rel) notFound()

  const athlete = rel.profiles as { id: string; full_name: string } | null
  if (!athlete) notFound()

  // Charger les programmes via l'API
  const response = await fetch(
    new URL(`/api/athletes/${params.id}/programmes`, process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
    {
      headers: {
        Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
      },
    }
  ).catch(() => null)

  let programs: ProgrammeData[] = []
  if (response?.ok) {
    const data = await response.json()
    programs = data.data?.programs || []
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <a href={`/coach/athletes/${params.id}`} className="text-gray-500 hover:text-white text-sm">
            ← Retour
          </a>
          <h1 className="text-2xl font-bold text-white mt-2">Programmes de {athlete.full_name}</h1>
        </div>
      </div>

      {/* Programmes */}
      {programs.length === 0 ? (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-8 text-center text-gray-400">
          <p>Aucun programme actif pour l'instant.</p>
          <a
            href={`/coach/athletes/${params.id}/programme/new`}
            className="text-orange-500 hover:underline text-sm mt-2 inline-block"
          >
            Créer un programme →
          </a>
        </div>
      ) : (
        <div className="space-y-6">
          {programs.map((program) => {
            const progress = program.sessions_count > 0
              ? Math.round((program.completed_sessions / program.sessions_count) * 100)
              : 0
            const hasHighAlerts = program.performance_alerts.some((a) => a.level === 'red')

            return (
              <div
                key={program.id}
                className="bg-gray-900 border border-gray-700 rounded-xl p-6"
              >
                {/* En-tête programme */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-white">{program.name}</h2>
                    <p className="text-sm text-gray-400 mt-1">
                      {program.type} • {format(parseISO(program.start_date), 'd MMM yyyy', { locale: fr })} →{' '}
                      {program.end_date
                        ? format(parseISO(program.end_date), 'd MMM yyyy', { locale: fr })
                        : 'En cours'}
                    </p>
                  </div>
                  {hasHighAlerts && <span className="px-2 py-1 bg-red-900/30 text-red-400 text-xs rounded">Alertes!</span>}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="bg-gray-800 rounded-lg p-3">
                    <div className="text-xs text-gray-400 mb-1">Séances</div>
                    <div className="text-lg font-bold text-white">
                      {program.completed_sessions}/{program.sessions_count}
                    </div>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-3">
                    <div className="text-xs text-gray-400 mb-1">Progression</div>
                    <div className="text-lg font-bold text-white">{progress}%</div>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-3">
                    <div className="text-xs text-gray-400 mb-1">Sets</div>
                    <div className="text-lg font-bold text-white">{program.sets_total}</div>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-3">
                    <div className="text-xs text-gray-400 mb-1">Alertes</div>
                    <div className="text-lg font-bold text-orange-400">{program.performance_alerts.length}</div>
                  </div>
                </div>

                {/* Barre de progression */}
                <div className="mb-6">
                  <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-orange-500 h-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>

                {/* Alertes de performance */}
                {program.performance_alerts.length > 0 && (
                  <div className="space-y-2 mb-4 border-t border-gray-700 pt-4">
                    <h3 className="text-sm font-medium text-gray-300">Alertes de performance:</h3>
                    {program.performance_alerts.map((alert, idx) => (
                      <div
                        key={idx}
                        className={`text-xs p-2 rounded ${
                          alert.level === 'red'
                            ? 'bg-red-900/30 text-red-300'
                            : 'bg-orange-900/30 text-orange-300'
                        }`}
                      >
                        {alert.message}
                      </div>
                    ))}
                  </div>
                )}

                {/* Action */}
                <a
                  href={`/coach/athletes/${params.id}`}
                  className="text-xs text-orange-500 hover:text-orange-400 inline-block mt-2"
                >
                  Voir les détails →
                </a>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
