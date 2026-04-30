'use client'

import { useState } from 'react'
import { format, parseISO, differenceInDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Competition } from '@/types/database'

interface Props {
  athletes: { id: string; full_name: string }[]
  defaultAthleteId: string
  initialCompetitions: Competition[]
  coachId: string
}

type LiftKey = 'squat' | 'bench' | 'deadlift'

export default function CompetitionsClient({ athletes, defaultAthleteId, initialCompetitions }: Props) {
  const [selectedAthleteId, setSelectedAthleteId] = useState(defaultAthleteId)
  const [competitions, setCompetitions] = useState<Competition[]>(initialCompetitions)
  const [selectedComp, setSelectedComp] = useState<Competition | null>(null)
  const [tab, setTab] = useState<'planification' | 'resultats' | 'bilan'>('planification')
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)

  const [newForm, setNewForm] = useState({ name: '', competition_date: '' })

  async function loadCompetitions(athleteId: string) {
    const res = await fetch(`/api/competitions?athlete_id=${athleteId}`)
    if (res.ok) setCompetitions(await res.json())
  }

  async function handleAthleteChange(id: string) {
    setSelectedAthleteId(id)
    setSelectedComp(null)
    await loadCompetitions(id)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch('/api/competitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newForm, athlete_id: selectedAthleteId }),
    })
    if (res.ok) {
      await loadCompetitions(selectedAthleteId)
      setShowNew(false)
      setNewForm({ name: '', competition_date: '' })
    }
    setSaving(false)
  }

  async function patchComp(id: string, payload: Partial<Competition>) {
    const res = await fetch(`/api/competitions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      const updated: Competition = await res.json()
      setCompetitions(prev => prev.map(c => c.id === id ? updated : c))
      setSelectedComp(updated)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette compétition ?')) return
    await fetch(`/api/competitions/${id}`, { method: 'DELETE' })
    setCompetitions(prev => prev.filter(c => c.id !== id))
    if (selectedComp?.id === id) setSelectedComp(null)
  }

  const daysUntil = selectedComp
    ? differenceInDays(parseISO(selectedComp.competition_date), new Date())
    : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Compétitions</h1>
        <div className="flex items-center gap-3">
          <select
            value={selectedAthleteId}
            onChange={e => handleAthleteChange(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            {athletes.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
          </select>
          <button
            onClick={() => setShowNew(!showNew)}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            + Nouvelle
          </button>
        </div>
      </div>

      {/* Formulaire nouvelle compétition */}
      {showNew && (
        <form onSubmit={handleCreate} className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">Nom de la compétition</label>
            <input
              required value={newForm.name}
              onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
              placeholder="ex: Régionaux Île-de-France"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Date</label>
            <input
              type="date" required value={newForm.competition_date}
              onChange={e => setNewForm(f => ({ ...f, competition_date: e.target.value }))}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <button type="submit" disabled={saving}
            className="px-5 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold rounded-lg text-sm">
            {saving ? '...' : 'Créer'}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Liste compétitions */}
        <div className="space-y-2">
          {competitions.length === 0 && (
            <p className="text-gray-500 text-sm">Aucune compétition.</p>
          )}
          {competitions.map(c => {
            const days = differenceInDays(parseISO(c.competition_date), new Date())
            const isPast = days < 0
            return (
              <button
                key={c.id}
                onClick={() => { setSelectedComp(c); setTab('planification') }}
                className={`w-full text-left p-4 rounded-xl border transition-colors ${
                  selectedComp?.id === c.id
                    ? 'border-orange-600 bg-orange-950/30'
                    : 'border-gray-800 bg-gray-900 hover:border-gray-600'
                }`}
              >
                <div className="font-medium text-white text-sm truncate">{c.name}</div>
                <div className="text-gray-400 text-xs mt-1">
                  {format(parseISO(c.competition_date), 'd MMM yyyy', { locale: fr })}
                </div>
                <div className="flex items-center justify-between mt-2">
                  {isPast ? (
                    c.total_kg
                      ? <span className="text-orange-400 font-mono font-bold text-sm">{c.total_kg} kg</span>
                      : <span className="text-gray-500 text-xs">Passée</span>
                  ) : (
                    <span className={`text-xs font-medium ${days <= 14 ? 'text-red-400' : days <= 30 ? 'text-orange-400' : 'text-green-400'}`}>
                      J-{days}
                    </span>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(c.id) }}
                    className="text-gray-700 hover:text-red-500 text-xs transition-colors"
                  >×</button>
                </div>
              </button>
            )
          })}
        </div>

        {/* Détail compétition */}
        {selectedComp && (
          <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-gray-800">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">{selectedComp.name}</h2>
                  <p className="text-gray-400 text-sm mt-0.5">
                    {format(parseISO(selectedComp.competition_date), 'EEEE d MMMM yyyy', { locale: fr })}
                    {daysUntil != null && daysUntil >= 0 && (
                      <span className={`ml-2 font-semibold ${daysUntil <= 14 ? 'text-red-400' : daysUntil <= 30 ? 'text-orange-400' : 'text-green-400'}`}>
                        J-{daysUntil}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Onglets */}
              <div className="flex gap-1 mt-4">
                {(['planification', 'resultats', 'bilan'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                      tab === t ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-5">
              {tab === 'planification' && (
                <PlanificationTab comp={selectedComp} onSave={p => patchComp(selectedComp.id, p)} />
              )}
              {tab === 'resultats' && (
                <ResultatsTab comp={selectedComp} onSave={p => patchComp(selectedComp.id, p)} />
              )}
              {tab === 'bilan' && (
                <BilanTab comp={selectedComp} onSave={p => patchComp(selectedComp.id, p)} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Onglet Planification — tentatives
// ============================================================
function PlanificationTab({ comp, onSave }: { comp: Competition; onSave: (p: Partial<Competition>) => void }) {
  const [form, setForm] = useState({
    squat_attempt_1: comp.squat_attempt_1?.toString() ?? '',
    squat_attempt_2: comp.squat_attempt_2?.toString() ?? '',
    squat_attempt_3: comp.squat_attempt_3?.toString() ?? '',
    bench_attempt_1: comp.bench_attempt_1?.toString() ?? '',
    bench_attempt_2: comp.bench_attempt_2?.toString() ?? '',
    bench_attempt_3: comp.bench_attempt_3?.toString() ?? '',
    deadlift_attempt_1: comp.deadlift_attempt_1?.toString() ?? '',
    deadlift_attempt_2: comp.deadlift_attempt_2?.toString() ?? '',
    deadlift_attempt_3: comp.deadlift_attempt_3?.toString() ?? '',
  })

  function parseAttempts() {
    return Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v ? parseFloat(v) : null])
    )
  }

  function projectedTotal() {
    const lifts: LiftKey[] = ['squat', 'bench', 'deadlift']
    let total = 0
    for (const lift of lifts) {
      const a3 = parseFloat(form[`${lift}_attempt_3` as keyof typeof form])
      if (!isNaN(a3)) total += a3
    }
    return total > 0 ? total : null
  }

  const projected = projectedTotal()

  return (
    <div className="space-y-5">
      {(['squat', 'bench', 'deadlift'] as LiftKey[]).map(lift => (
        <div key={lift}>
          <h3 className="text-sm font-semibold text-white mb-2 capitalize">{lift}</h3>
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map(n => (
              <div key={n}>
                <label className="block text-xs text-gray-500 mb-1">Tentative {n}</label>
                <input
                  type="number"
                  value={form[`${lift}_attempt_${n}` as keyof typeof form]}
                  onChange={e => setForm(f => ({ ...f, [`${lift}_attempt_${n}`]: e.target.value }))}
                  step="2.5"
                  placeholder="—"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {projected != null && (
        <div className="bg-gray-800 rounded-xl p-3 flex items-center justify-between">
          <span className="text-gray-400 text-sm">Total projeté</span>
          <span className="text-orange-400 font-mono font-bold text-xl">{projected} kg</span>
        </div>
      )}

      <button
        onClick={() => onSave({ ...parseAttempts(), projected_total: projected })}
        className="px-5 py-2 bg-orange-600 hover:bg-orange-500 text-white font-semibold rounded-lg text-sm transition-colors"
      >
        Sauvegarder les tentatives
      </button>
    </div>
  )
}

// ============================================================
// Onglet Résultats
// ============================================================
function ResultatsTab({ comp, onSave }: { comp: Competition; onSave: (p: Partial<Competition>) => void }) {
  type ResultField = { attempt: string; result: boolean | null }
  type LiftResults = [ResultField, ResultField, ResultField]

  function initLift(lift: LiftKey): LiftResults {
    return [1, 2, 3].map(n => ({
      attempt: (comp[`${lift}_attempt_${n}` as keyof Competition] as number | null)?.toString() ?? '',
      result: comp[`${lift}_result_${n}` as keyof Competition] as boolean | null,
    })) as LiftResults
  }

  const [squatR, setSquatR] = useState<LiftResults>(initLift('squat'))
  const [benchR, setBenchR] = useState<LiftResults>(initLift('bench'))
  const [deadliftR, setDeadliftR] = useState<LiftResults>(initLift('deadlift'))
  const [ipf, setIpf] = useState(comp.ipf_gl_points?.toString() ?? '')

  function bestLift(results: LiftResults): number | null {
    const made = results
      .filter(r => r.result === true && r.attempt)
      .map(r => parseFloat(r.attempt))
      .filter(v => !isNaN(v))
    return made.length > 0 ? Math.max(...made) : null
  }

  function buildPayload() {
    const lifts: [LiftKey, LiftResults][] = [['squat', squatR], ['bench', benchR], ['deadlift', deadliftR]]
    const payload: Partial<Competition> = {}
    for (const [lift, results] of lifts) {
      for (let i = 0; i < 3; i++) {
        const n = i + 1;
        (payload as Record<string, unknown>)[`${lift}_result_${n}`] = results[i].result
      }
      (payload as Record<string, unknown>)[`${lift}_best_kg`] = bestLift(results)
    }
    const sq = bestLift(squatR) ?? 0
    const bp = bestLift(benchR) ?? 0
    const dl = bestLift(deadliftR) ?? 0
    payload.total_kg = sq + bp + dl > 0 ? sq + bp + dl : null
    payload.ipf_gl_points = ipf ? parseFloat(ipf) : null
    return payload
  }

  function LiftResultRow({ label, results, setResults }: {
    label: string
    results: LiftResults
    setResults: (r: LiftResults) => void
  }) {
    const best = bestLift(results)
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-white">{label}</h3>
          {best != null && <span className="text-green-400 font-mono font-bold text-sm">{best} kg</span>}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {results.map((r, i) => (
            <div key={i} className={`rounded-xl border p-3 transition-colors ${
              r.result === true ? 'border-green-700 bg-green-950/30' :
              r.result === false ? 'border-red-800 bg-red-950/30' :
              'border-gray-700 bg-gray-800'
            }`}>
              <div className="text-gray-400 text-xs mb-2 text-center">Tentative {i + 1}</div>
              <div className="text-white font-mono text-center text-sm font-semibold mb-3">
                {r.attempt || '—'} kg
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const updated = [...results] as LiftResults
                    updated[i] = { ...r, result: true }
                    setResults(updated)
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    r.result === true ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-green-900'
                  }`}
                >✓</button>
                <button
                  onClick={() => {
                    const updated = [...results] as LiftResults
                    updated[i] = { ...r, result: false }
                    setResults(updated)
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    r.result === false ? 'bg-red-700 text-white' : 'bg-gray-700 text-gray-400 hover:bg-red-900'
                  }`}
                >✗</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const sq = bestLift(squatR) ?? 0
  const bp = bestLift(benchR) ?? 0
  const dl = bestLift(deadliftR) ?? 0
  const total = sq + bp + dl

  return (
    <div className="space-y-5">
      <LiftResultRow label="Squat" results={squatR} setResults={setSquatR} />
      <LiftResultRow label="Bench Press" results={benchR} setResults={setBenchR} />
      <LiftResultRow label="Deadlift" results={deadliftR} setResults={setDeadliftR} />

      {total > 0 && (
        <div className="bg-gray-800 rounded-xl p-4">
          <div className="grid grid-cols-4 gap-3 text-center">
            <div><div className="text-gray-500 text-xs">Squat</div><div className="text-white font-mono font-bold">{sq > 0 ? sq : '—'}</div></div>
            <div><div className="text-gray-500 text-xs">Bench</div><div className="text-white font-mono font-bold">{bp > 0 ? bp : '—'}</div></div>
            <div><div className="text-gray-500 text-xs">Deadlift</div><div className="text-white font-mono font-bold">{dl > 0 ? dl : '—'}</div></div>
            <div><div className="text-gray-500 text-xs">Total</div><div className="text-orange-400 font-mono font-bold text-lg">{total}</div></div>
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs text-gray-400 mb-1">Points IPF GL</label>
        <input type="number" value={ipf} onChange={e => setIpf(e.target.value)} step="0.001" placeholder="ex: 412.345"
          className="w-40 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      <button onClick={() => onSave(buildPayload())}
        className="px-5 py-2 bg-green-700 hover:bg-green-600 text-white font-semibold rounded-lg text-sm transition-colors">
        Sauvegarder les résultats
      </button>
    </div>
  )
}

// ============================================================
// Onglet Bilan post-compétition
// ============================================================
function BilanTab({ comp, onSave }: { comp: Competition; onSave: (p: Partial<Competition>) => void }) {
  const [notes, setNotes] = useState(comp.post_comp_notes ?? '')
  const [weakest, setWeakest] = useState(comp.weakest_lift ?? '')
  const [goals, setGoals] = useState(comp.next_block_goals ?? '')

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Notes post-compétition</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
          placeholder="Bilan général, conditions, ressenti..."
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Lift le plus faible</label>
        <select value={weakest} onChange={e => setWeakest(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
          <option value="">— Sélectionner —</option>
          <option value="squat">Squat</option>
          <option value="bench">Bench Press</option>
          <option value="deadlift">Deadlift</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Objectifs prochain bloc</label>
        <textarea value={goals} onChange={e => setGoals(e.target.value)} rows={3}
          placeholder="Points à travailler, objectifs chiffrés..."
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
        />
      </div>
      <button
        onClick={() => onSave({ post_comp_notes: notes || null, weakest_lift: weakest || null, next_block_goals: goals || null })}
        className="px-5 py-2 bg-orange-600 hover:bg-orange-500 text-white font-semibold rounded-lg text-sm transition-colors">
        Sauvegarder le bilan
      </button>
    </div>
  )
}
