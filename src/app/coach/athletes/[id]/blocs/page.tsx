import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Block } from '@/types/database'
import { Plus } from '@/components/ui/Icon'

const TYPE_TONES: Record<Block['type'], string> = {
  Accumulation: 'bg-blue-900/40 text-blue-300',
  Intensification: 'bg-purple-900/40 text-purple-300',
  Réalisation: 'bg-orange-900/40 text-orange-300',
  Deload: 'bg-zinc-800 text-zinc-300',
}

export default async function BlocsListPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  // Charge les blocs + nombre de séances par bloc
  const { data: blocks } = await supabase
    .from('blocks')
    .select('*')
    .eq('athlete_id', id)
    .order('start_date', { ascending: false })

  const blockIds = (blocks ?? []).map(b => b.id)
  const { data: sessionCounts } = blockIds.length
    ? await supabase
        .from('sessions')
        .select('block_id, status')
        .in('block_id', blockIds)
    : { data: [] }

  const stats: Record<string, { total: number; done: number }> = {}
  for (const s of sessionCounts ?? []) {
    if (!s.block_id) continue
    stats[s.block_id] ??= { total: 0, done: 0 }
    stats[s.block_id].total++
    if (s.status === 'completed') stats[s.block_id].done++
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Blocs d&apos;entraînement</h1>
          <p className="text-sm text-zinc-500">
            Crée un bloc, prescris une semaine type puis génère les semaines suivantes.
          </p>
        </div>
        <Link href={`/coach/athletes/${id}/blocs/new`} className="btn-primary">
          <Plus className="size-4" />
          Nouveau bloc
        </Link>
      </div>

      {(blocks ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 p-12 text-center">
          <p className="text-zinc-400">Aucun bloc encore créé pour cet athlète.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {(blocks ?? []).map(b => {
            const s = stats[b.id] ?? { total: 0, done: 0 }
            const pct = s.total ? Math.round((s.done / s.total) * 100) : 0
            return (
              <Link
                key={b.id}
                href={`/coach/athletes/${id}/blocs/${b.id}`}
                className="group rounded-xl border border-zinc-800 bg-zinc-950 p-4 transition-colors hover:border-orange-700/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold text-white">{b.name}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${TYPE_TONES[b.type]}`}>{b.type}</span>
                      {b.is_taper && (
                        <span className="rounded-full bg-amber-900/40 px-2 py-0.5 text-[11px] text-amber-300">Taper</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      {format(parseISO(b.start_date), 'd MMM yyyy', { locale: fr })}
                      {b.total_weeks ? ` · ${b.total_weeks} sem.` : ''}
                      {b.intensity_zone ? ` · ${b.intensity_zone}` : ''}
                    </p>
                  </div>
                  <span className="text-zinc-600 transition-colors group-hover:text-orange-500">→</span>
                </div>
                {s.total > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-500">
                      <span>{s.done}/{s.total} séances terminées</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-900">
                      <div className="h-full bg-emerald-600" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
