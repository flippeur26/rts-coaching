import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AthleteSettingsForm from '@/components/athlete/AthleteSettingsForm'

export default async function AthleteParametresPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <AthleteSettingsForm athleteId={user.id} />
}
