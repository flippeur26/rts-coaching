import { createClient } from '@/lib/supabase/server'
import CalendrierClient from '@/components/calendrier/CalendrierClient'

export default async function CalendrierPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: athletes } = await supabase
    .from('coach_athlete')
    .select('athlete_id, profiles!coach_athlete_athlete_id_fkey(id, full_name)')
    .eq('coach_id', user!.id)
    .eq('status', 'accepted')

  const athleteList = (athletes ?? []).map(rel => {
    const p = rel.profiles as { id: string; full_name: string } | null
    return { id: rel.athlete_id, full_name: p?.full_name ?? '' }
  })

  return <CalendrierClient athletes={athleteList} coachId={user!.id} />
}
