import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import SaisieSeanceClient from '@/components/athlete/SaisieSeanceClient'

export default async function AthleteSeancePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: session } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', id)
    .eq('athlete_id', user.id)
    .single()

  if (!session) notFound()

  const { data: sets } = await supabase
    .from('sets')
    .select('*')
    .eq('session_id', id)
    .order('set_number', { ascending: true })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">
          {session.notes_coach || 'Séance'}
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          {format(parseISO(session.scheduled_date), 'EEEE d MMMM', { locale: fr })}
          {session.week_in_block ? ` · S${session.week_in_block}` : ''}
        </p>
      </div>

      <SaisieSeanceClient
        session={session}
        initialSets={sets ?? []}
      />
    </div>
  )
}
