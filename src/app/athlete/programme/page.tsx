import { createClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

export default async function AthleteProgrammePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const today = new Date().toISOString().split('T')[0]

  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, scheduled_date, status, notes_coach, week_in_block')
    .eq('athlete_id', user!.id)
    .gte('scheduled_date', today)
    .order('scheduled_date', { ascending: true })
    .limit(5)

  const todaySession = sessions?.find(s => s.scheduled_date === today)
  const upcoming = sessions?.filter(s => s.scheduled_date !== today) ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Mon Programme</h1>
        <p className="text-gray-400 text-sm mt-1">
          {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
        </p>
      </div>

      {todaySession ? (
        <div className="bg-gray-900 border border-orange-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Séance du jour</h2>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              todaySession.status === 'completed' ? 'bg-green-900 text-green-300' :
              todaySession.status === 'in_progress' ? 'bg-orange-900 text-orange-300' :
              'bg-gray-800 text-gray-300'
            }`}>
              {todaySession.status === 'completed' ? 'Terminée' :
               todaySession.status === 'in_progress' ? 'En cours' : 'Prescrite'}
            </span>
          </div>
          <a
            href={`/athlete/seance/${todaySession.id}`}
            className="block w-full text-center py-3 bg-orange-600 hover:bg-orange-500 text-white font-semibold rounded-lg transition-colors"
          >
            {todaySession.status === 'completed' ? 'Voir la séance' : 'Commencer la séance'}
          </a>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
          <p className="text-gray-400">Aucune séance prévue aujourd&apos;hui.</p>
        </div>
      )}

      {upcoming.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
            Prochaines séances
          </h2>
          <div className="space-y-3">
            {upcoming.map(session => (
              <div key={session.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium">
                      {format(new Date(session.scheduled_date), "EEEE d MMM", { locale: fr })}
                    </p>
                    {session.notes_coach && (
                      <p className="text-gray-400 text-sm mt-1">{session.notes_coach}</p>
                    )}
                  </div>
                  <span className="text-gray-600 text-sm">
                    Semaine {session.week_in_block ?? '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
