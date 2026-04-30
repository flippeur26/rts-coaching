import { createClient } from '@/lib/supabase/server'
import AnalyseClient from '@/components/analyse/AnalyseClient'

export default async function AnalysePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: relations } = await supabase
    .from('coach_athlete')
    .select('athlete_id, profiles!coach_athlete_athlete_id_fkey(id, full_name)')
    .eq('coach_id', user!.id)
    .eq('status', 'accepted')

  const athletes = (relations ?? []).map(r => {
    const p = r.profiles as { id: string; full_name: string } | null
    return { id: r.athlete_id, full_name: p?.full_name ?? '' }
  })

  return <AnalyseClient athletes={athletes} />
}
