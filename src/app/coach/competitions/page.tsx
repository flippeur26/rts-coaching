import { createClient } from '@/lib/supabase/server'
import CompetitionsClient from '@/components/competition/CompetitionsClient'
import type { Competition } from '@/types/database'

export default async function CompetitionsPage({
  searchParams,
}: {
  searchParams: Promise<{ athlete?: string }>
}) {
  const { athlete: athleteParam } = await searchParams
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

  const defaultAthleteId = athleteParam ?? athletes[0]?.id ?? ''

  let competitions: Competition[] = []
  if (defaultAthleteId) {
    const { data } = await supabase
      .from('competitions')
      .select('*')
      .eq('athlete_id', defaultAthleteId)
      .order('competition_date', { ascending: false })
    competitions = data ?? []
  }

  return (
    <CompetitionsClient
      athletes={athletes}
      defaultAthleteId={defaultAthleteId}
      initialCompetitions={competitions}
      coachId={user!.id}
    />
  )
}
