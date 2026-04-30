import { createClient } from '@/lib/supabase/server'
import { format, subDays } from 'date-fns'
import TraceursClient from '@/components/athlete/TraceursClient'

export default async function TraceursPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const today = format(new Date(), 'yyyy-MM-dd')
  const from = format(subDays(new Date(), 29), 'yyyy-MM-dd')

  const { data: trackers } = await supabase
    .from('daily_trackers')
    .select('*')
    .eq('athlete_id', user!.id)
    .gte('date', from)
    .order('date', { ascending: false })

  const todayTracker = trackers?.find(t => t.date === today) ?? null

  return (
    <TraceursClient
      todayDate={today}
      todayTracker={todayTracker}
      history={trackers ?? []}
    />
  )
}
