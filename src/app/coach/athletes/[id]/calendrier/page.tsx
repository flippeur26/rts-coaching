import { createClient } from '@/lib/supabase/server'
import CalendrierClient from '@/components/calendrier/CalendrierClient'

/** Calendrier scopé à un athlète unique (réutilise CalendrierClient avec une seule entrée). */
export default async function AthleteCalendrierPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('id', id)
    .single()

  return (
    <CalendrierClient
      athletes={[{ id: profile!.id, full_name: profile!.full_name }]}
      coachId={user!.id}
    />
  )
}
