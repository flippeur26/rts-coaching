import { createClient } from '@/lib/supabase/server'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

export default async function HistoriquePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, scheduled_date, status, notes_coach, week_in_block, session_feel, duration_min')
    .eq('athlete_id', user!.id)
    .order('scheduled_date', { ascending: false })
    .limit(30)

  const completed = sessions?.filter(s => s.status === 'completed') ?? []
  const others = sessions?.filter(s => s.status !== 'completed') ?? []

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-white">Historique</h1>

      {sessions?.length === 0 && (
        <p className="text-gray-500 text-center py-8">Aucune séance encore.</p>
      )}

      {others.length > 0 && (
        <div>
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">À venir / En cours</h2>
          <div className="space-y-2">
            {others.map(s => (
              <SessionRow key={s.id} session={s} />
            ))}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Terminées</h2>
          <div className="space-y-2">
            {completed.map(s => (
              <SessionRow key={s.id} session={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

type SessionLike = {
  id: string
  scheduled_date: string
  status: string
  notes_coach: string | null
  week_in_block: number | null
  session_feel: number | null
  duration_min: number | null
}

function SessionRow({ session: s }: { session: SessionLike }) {
  return (
    <a
      href={`/athlete/seance/${s.id}`}
      className="flex items-center justify-between bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-4 transition-colors"
    >
      <div>
        <p className="text-white text-sm font-medium">
          {format(parseISO(s.scheduled_date), 'EEE d MMM', { locale: fr })}
        </p>
        <p className="text-gray-500 text-xs mt-0.5">
          {s.notes_coach ?? 'Séance'}
          {s.week_in_block ? ` · S${s.week_in_block}` : ''}
          {s.duration_min ? ` · ${s.duration_min} min` : ''}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {s.session_feel != null && (
          <span className={`text-sm font-bold ${
            s.session_feel >= 4 ? 'text-green-400' :
            s.session_feel >= 3 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {s.session_feel}/5
          </span>
        )}
        <span className={`text-xs px-2 py-1 rounded-full ${
          s.status === 'completed' ? 'bg-green-900 text-green-300' :
          s.status === 'in_progress' ? 'bg-orange-900 text-orange-300' :
          'bg-gray-800 text-gray-400'
        }`}>
          {s.status === 'completed' ? '✓' : s.status === 'in_progress' ? '…' : '→'}
        </span>
      </div>
    </a>
  )
}
