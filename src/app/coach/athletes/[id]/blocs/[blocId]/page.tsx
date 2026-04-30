import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BlockEditorClient from '@/components/coach/BlockEditorClient'
import type { Block, Session, Set as SetRow } from '@/types/database'

type SessionWithSets = Session & { sets: SetRow[] }

export default async function BlocEditorPage({
  params,
}: {
  params: Promise<{ id: string; blocId: string }>
}) {
  const { id, blocId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: block } = await supabase.from('blocks').select('*').eq('id', blocId).single()
  if (!block) notFound()
  if (block.coach_id !== user.id || block.athlete_id !== id) notFound()

  const { data: sessions } = await supabase
    .from('sessions')
    .select('*, sets(*)')
    .eq('block_id', blocId)
    .order('week_in_block', { ascending: true })
    .order('session_number', { ascending: true })
    .order('scheduled_date', { ascending: true })
    .order('set_number', { referencedTable: 'sets', ascending: true })

  return (
    <BlockEditorClient
      initialBlock={block as Block}
      initialSessions={((sessions ?? []) as unknown) as SessionWithSets[]}
      athleteId={id}
    />
  )
}
