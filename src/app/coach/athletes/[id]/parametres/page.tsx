import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AthleteSettingsForm from '@/components/athlete/AthleteSettingsForm'

export default async function CoachAthleteParametresPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', id)
    .single()

  return <AthleteSettingsForm athleteId={id} athleteName={profile?.full_name} />
}
