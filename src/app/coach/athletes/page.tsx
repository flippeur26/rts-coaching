import { createClient } from '@/lib/supabase/server'
import AjouterAthleteClient from '@/components/coach/AjouterAthleteClient'

export default async function AthletesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: relations } = await supabase
    .from('coach_athlete')
    .select('athlete_id, created_at, profiles!coach_athlete_athlete_id_fkey(id, full_name, email)')
    .eq('coach_id', user!.id)
    .eq('status', 'accepted')
    .order('created_at', { ascending: false })

  const athletes = (relations ?? []).map(r => {
    const p = r.profiles as { id: string; full_name: string; email: string } | null
    return { id: r.athlete_id, full_name: p?.full_name ?? '', email: p?.email ?? '', since: r.created_at }
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Mes athlètes</h1>
          <p className="text-gray-400 mt-1">{athletes.length} athlète(s)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {athletes.map(a => (
          <a
            key={a.id}
            href={`/coach/athletes/${a.id}`}
            className="flex items-center gap-4 bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-4 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-orange-800 flex items-center justify-center text-white font-bold text-sm shrink-0">
              {a.full_name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium truncate">{a.full_name}</p>
              <p className="text-gray-500 text-sm truncate">{a.email}</p>
            </div>
            <span className="text-gray-600 text-sm">→</span>
          </a>
        ))}
      </div>

      <AjouterAthleteClient />
    </div>
  )
}
