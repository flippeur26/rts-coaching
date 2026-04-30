import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AthleteSubNav from '@/components/coach/AthleteSubNav'

/**
 * Layout d'un athlète : vérifie la relation coach↔athlète,
 * affiche le sous-menu (Profil, Dashboard, Calendrier, Traceurs, Blocs).
 *
 * Toutes les pages enfants peuvent partir du principe que :
 *   - l'athlète existe et appartient au coach courant
 *   - les params { id } sont sûrs côté DB
 */
export default async function AthleteLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) notFound()

  const { data: rel } = await supabase
    .from('coach_athlete')
    .select('athlete_id, profiles!coach_athlete_athlete_id_fkey(id, full_name)')
    .eq('coach_id', user.id)
    .eq('athlete_id', id)
    .eq('status', 'accepted')
    .single()

  if (!rel) notFound()
  const profile = rel.profiles as { id: string; full_name: string } | null
  if (!profile) notFound()

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-8 mb-0">
      <AthleteSubNav athleteId={id} athleteName={profile.full_name} />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
    </div>
  )
}
