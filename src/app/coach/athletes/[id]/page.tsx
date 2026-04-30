import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { format, subDays, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import Link from 'next/link'
import type { Block, Competition } from '@/types/database'
import { CalendarDays, Dumbbell, Heart, Activity, Trophy } from '@/components/ui/Icon'

/**
 * Page Profil athlète — vue synthétique de redirection.
 * Le détail (calendrier / dashboard / traceurs / blocs) est dans les sous-pages.
 */
export default async function ProfilAthletePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  const [{ data: profile }, { data: blocks }, { data: latestComp }, { data: latestSession }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, created_at').eq('id', id).single(),
    supabase
      .from('blocks')
      .select('*')
      .eq('athlete_id', id)
      .order('start_date', { ascending: false })
      .limit(3),
    supabase
      .from('competitions')
      .select('*')
      .eq('athlete_id', id)
      .order('competition_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('sessions')
      .select('id, scheduled_date, status, notes_coach, session_feel')
      .eq('athlete_id', id)
      .order('scheduled_date', { ascending: false })
      .limit(5),
  ])
  if (!profile) notFound()

  const sevenDaysAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd')
  const { data: weekTrackers } = await supabase
    .from('daily_trackers')
    .select('general_fatigue, motivation, recovery, sleep_quality')
    .eq('athlete_id', id)
    .gte('date', sevenDaysAgo)

  const avgFatigue = avg(weekTrackers ?? [], 'general_fatigue')
  const avgMotivation = avg(weekTrackers ?? [], 'motivation')

  const activeBlock = (blocks ?? [])[0] as Block | undefined

  return (
    <div className="space-y-6">
      {/* Header profil */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-white">{profile.full_name}</h1>
            <p className="text-sm text-zinc-500">{profile.email}</p>
            <p className="mt-1 text-xs text-zinc-600">
              Inscrit le {format(parseISO(profile.created_at), 'd MMMM yyyy', { locale: fr })}
            </p>
          </div>
          <div className="flex gap-2">
            <Quick href={`/coach/athletes/${id}/blocs/new`} label="+ Nouveau bloc" tone="primary" />
          </div>
        </div>
      </div>

      {/* Cartes navigation */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NavCard href={`/coach/athletes/${id}/dashboard`} Icon={Activity} label="Dashboard" hint="e1RM, alertes" />
        <NavCard href={`/coach/athletes/${id}/calendrier`} Icon={CalendarDays} label="Calendrier" hint="planification" />
        <NavCard href={`/coach/athletes/${id}/traceurs`} Icon={Heart} label="Traceurs" hint="60 jours" />
        <NavCard href={`/coach/athletes/${id}/blocs`} Icon={Dumbbell} label="Blocs" hint={`${blocks?.length ?? 0} bloc(s)`} />
      </div>

      {/* Aperçu rapide */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <h3 className="mb-2 text-xs uppercase tracking-wider text-zinc-400">Bloc en cours</h3>
          {activeBlock ? (
            <Link href={`/coach/athletes/${id}/blocs/${activeBlock.id}`} className="block">
              <p className="font-semibold text-white">{activeBlock.name}</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {activeBlock.type}
                {activeBlock.total_weeks ? ` · ${activeBlock.total_weeks} sem.` : ''}
                {' · '}depuis {format(parseISO(activeBlock.start_date), 'd MMM', { locale: fr })}
              </p>
            </Link>
          ) : (
            <p className="text-sm text-zinc-500">Aucun bloc actif</p>
          )}
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <h3 className="mb-2 text-xs uppercase tracking-wider text-zinc-400">État 7j</h3>
          <div className="grid grid-cols-2 gap-2 text-center">
            <Mini label="Fatigue" value={avgFatigue?.toFixed(1) ?? '—'} suffix="/5" />
            <Mini label="Motivation" value={avgMotivation?.toFixed(1) ?? '—'} suffix="/5" />
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <h3 className="mb-2 flex items-center gap-1 text-xs uppercase tracking-wider text-zinc-400">
            <Trophy className="size-3.5" /> Prochaine / dernière compétition
          </h3>
          {latestComp ? (
            <CompetitionInfo comp={latestComp as Competition} />
          ) : (
            <p className="text-sm text-zinc-500">Aucune compétition</p>
          )}
        </div>
      </div>

      {/* Séances récentes */}
      {(latestSession ?? []).length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <h3 className="mb-2 text-xs uppercase tracking-wider text-zinc-400">Séances récentes</h3>
          <div className="divide-y divide-zinc-800/60">
            {(latestSession ?? []).map(s => (
              <div key={s.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="text-zinc-200">{format(parseISO(s.scheduled_date), 'EEE d MMM', { locale: fr })}</span>
                  {s.notes_coach && <span className="ml-2 text-xs text-zinc-500">· {s.notes_coach}</span>}
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    s.status === 'completed'
                      ? 'bg-emerald-900/40 text-emerald-300'
                      : s.status === 'in_progress'
                      ? 'bg-amber-900/40 text-amber-300'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {s.status === 'completed' ? 'Terminée' : s.status === 'in_progress' ? 'En cours' : 'Prescrite'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function avg<T extends Record<string, unknown>>(arr: T[], field: keyof T): number | null {
  const vals = arr.map(x => x[field]).filter(v => typeof v === 'number') as number[]
  if (vals.length === 0) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function NavCard({
  href,
  Icon,
  label,
  hint,
}: {
  href: string
  Icon: typeof CalendarDays
  label: string
  hint?: string
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-950 p-4 transition-colors hover:border-orange-700/60 hover:bg-zinc-900/50"
    >
      <Icon className="size-5 text-zinc-500 transition-colors group-hover:text-orange-500" />
      <div>
        <div className="text-sm font-semibold text-white">{label}</div>
        {hint && <div className="text-xs text-zinc-500">{hint}</div>}
      </div>
    </Link>
  )
}

function Quick({ href, label, tone }: { href: string; label: string; tone: 'primary' | 'secondary' }) {
  return (
    <Link href={href} className={tone === 'primary' ? 'btn-primary' : 'btn-secondary'}>
      {label}
    </Link>
  )
}

function Mini({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-md bg-zinc-900 p-2">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="font-mono text-base font-semibold text-white">
        {value}
        {suffix && <span className="ml-0.5 text-xs text-zinc-500">{suffix}</span>}
      </div>
    </div>
  )
}

function CompetitionInfo({ comp }: { comp: Competition }) {
  const date = parseISO(comp.competition_date)
  const isPast = date < new Date()
  return (
    <div>
      <p className="font-semibold text-white">{comp.name}</p>
      <p className="mt-0.5 text-xs text-zinc-500">
        {format(date, 'd MMM yyyy', { locale: fr })}
        {' · '}
        <span className={isPast ? 'text-zinc-500' : 'text-orange-400'}>
          {isPast ? 'Passée' : 'À venir'}
        </span>
      </p>
      {comp.total_kg && (
        <p className="mt-1 font-mono text-sm text-orange-300">{comp.total_kg} kg total</p>
      )}
    </div>
  )
}
