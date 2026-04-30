import { createClient } from '@/lib/supabase/server'
import AjouterAthleteClient from '@/components/coach/AjouterAthleteClient'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

/**
 * Accueil coach = sélecteur d'athlètes.
 * Une fois un athlète choisi → /coach/athletes/[id] (Profil)
 * et toute la nav suivante (Calendrier / Dashboard / Traceurs / Blocs)
 * passe par AthleteSubNav.
 */
export default async function CoachHomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: relations } = await supabase
    .from('coach_athlete')
    .select('athlete_id, created_at, profiles!coach_athlete_athlete_id_fkey(id, full_name, email)')
    .eq('coach_id', user!.id)
    .eq('status', 'accepted')
    .order('created_at', { ascending: false })

  const athletes = (relations ?? []).map(r => {
    const p = r.profiles as { id: string; full_name: string; email: string } | null
    return {
      id: r.athlete_id,
      full_name: p?.full_name ?? '',
      email: p?.email ?? '',
      since: r.created_at,
    }
  })

  // Compteurs rapides par athlète : sessions complétées récemment, alertes ouvertes
  const athleteIds = athletes.map(a => a.id)
  const last30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const { data: recentSessions } = athleteIds.length
    ? await supabase
        .from('sessions')
        .select('athlete_id, status, scheduled_date')
        .in('athlete_id', athleteIds)
        .gte('scheduled_date', last30)
    : { data: [] }

  const sessionsByAthlete: Record<string, { done: number; planned: number }> = {}
  for (const s of recentSessions ?? []) {
    const k = s.athlete_id as string
    sessionsByAthlete[k] ??= { done: 0, planned: 0 }
    if (s.status === 'completed') sessionsByAthlete[k].done++
    else sessionsByAthlete[k].planned++
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-white">Mes athlètes</h1>
          <p className="text-sm text-zinc-500">
            Choisis un athlète pour accéder à son profil, calendrier, dashboard, traceurs et blocs d&apos;entraînement.
          </p>
        </div>
        <span className="text-sm text-zinc-400">
          {athletes.length} athlète{athletes.length > 1 ? 's' : ''}
        </span>
      </div>

      {/* Grille athlètes */}
      {athletes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 p-12 text-center">
          <p className="text-zinc-400">Aucun athlète lié pour l&apos;instant.</p>
          <p className="mt-1 text-sm text-zinc-500">
            Utilise le formulaire ci-dessous pour en lier un (par email).
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {athletes.map(a => {
            const stats = sessionsByAthlete[a.id]
            return (
              <Link
                key={a.id}
                href={`/coach/athletes/${a.id}`}
                className="group flex flex-col gap-3 rounded-xl border border-zinc-800 bg-gradient-to-t from-zinc-900 to-zinc-950 p-4 transition-colors hover:border-orange-700/60 hover:bg-zinc-900"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-700 to-orange-900 text-lg font-semibold text-white">
                    {a.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-white">{a.full_name}</p>
                    <p className="truncate text-xs text-zinc-500">{a.email}</p>
                  </div>
                  <span className="text-zinc-600 transition-colors group-hover:text-orange-500">→</span>
                </div>

                <div className="flex items-center gap-4 text-xs text-zinc-500">
                  <span>
                    Lié le {format(parseISO(a.since), 'd MMM yyyy', { locale: fr })}
                  </span>
                  {stats && (
                    <span className="ml-auto inline-flex items-center gap-2">
                      <span className="text-emerald-400">✓ {stats.done}</span>
                      <span className="text-zinc-500">/ {stats.done + stats.planned}</span>
                      <span className="text-zinc-600">30j</span>
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* Lier un athlète */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-5">
        <h2 className="mb-3 text-sm uppercase tracking-wider text-zinc-400">Lier un athlète</h2>
        <AjouterAthleteClient />
      </div>
    </div>
  )
}
