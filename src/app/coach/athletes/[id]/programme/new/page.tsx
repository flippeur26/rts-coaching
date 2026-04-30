import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProgrammeBuilderClient } from '@/components/coach/ProgrammeBuilderClient'

async function getAthleteAndTraceurs(athleteId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Vérifier que le coach est bien coach de l'athlète (lien accepté)
  const { data: rel } = await supabase
    .from('coach_athlete')
    .select('athlete_id')
    .eq('coach_id', user.id)
    .eq('athlete_id', athleteId)
    .eq('status', 'accepted')
    .single()

  if (!rel) {
    redirect('/coach/athletes')
  }

  // Charger le profil de l'athlète
  const { data: athlete } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('id', athleteId)
    .single()

  if (!athlete) {
    redirect('/coach/athletes')
  }

  // Charger les traceurs des 7 derniers jours
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0]

  const { data: traceurs } = await supabase
    .from('daily_trackers')
    .select('general_fatigue, recovery')
    .eq('athlete_id', athleteId)
    .gte('date', sevenDaysAgoStr)
    .order('date', { ascending: false })

  // Calculer l'alerte traceurs
  const shouldWarn =
    traceurs && traceurs.length > 0
      ? (() => {
          const avgFatigue =
            traceurs.reduce((sum, t) => sum + (t.general_fatigue || 0), 0) /
            traceurs.length
          const avgRecovery =
            traceurs.reduce((sum, t) => sum + (t.recovery || 0), 0) /
            traceurs.length

          return avgFatigue > 7 || avgRecovery < 4
        })()
      : false

  let traceursAlert = {
    shouldWarn: false,
    message: '',
  }

  if (shouldWarn) {
    const avgFatigue =
      traceurs!.reduce((sum, t) => sum + (t.general_fatigue || 0), 0) /
      traceurs!.length
    const avgRecovery =
      traceurs!.reduce((sum, t) => sum + (t.recovery || 0), 0) /
      traceurs!.length

    const reasons = []
    if (avgFatigue > 7) reasons.push(`Fatigue moyenne: ${avgFatigue.toFixed(1)}/10`)
    if (avgRecovery < 4) reasons.push(`Récupération moyenne: ${avgRecovery.toFixed(1)}/10`)

    traceursAlert = {
      shouldWarn: true,
      message: `Alerte: ${reasons.join(' - ')}`,
    }
  }

  return {
    athleteId: athlete.id,
    athleteName: athlete.full_name,
    traceursAlert,
  }
}

export default async function ProgrammeNewPage({ params }: { params: { id: string } }) {
  const { athleteId, athleteName, traceursAlert } = await getAthleteAndTraceurs(
    params.id
  )

  return (
    <ProgrammeBuilderClient
      athlete_id={athleteId}
      athlete_name={athleteName}
      traceursAlert={traceursAlert}
    />
  )
}
