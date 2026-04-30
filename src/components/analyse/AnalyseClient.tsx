'use client'

import { useState, useEffect } from 'react'
import {
  LineChart, Line, BarChart, Bar, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { Block } from '@/types/database'
import type { BlockAnalysis } from '@/lib/analyse'
import { analyseBlock } from '@/lib/analyse'
import type { Session, Set } from '@/types/database'

interface Props {
  athletes: { id: string; full_name: string }[]
}

const COLORS = ['#f97316', '#3b82f6', '#10b981', '#a855f7', '#f43f5e']

export default function AnalyseClient({ athletes }: Props) {
  const [selectedAthleteId, setSelectedAthleteId] = useState(athletes[0]?.id ?? '')
  const [blocks, setBlocks] = useState<Block[]>([])
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([])
  const [analyses, setAnalyses] = useState<BlockAnalysis[]>([])
  const [loading, setLoading] = useState(false)
  const [activeChart, setActiveChart] = useState<'e1rm' | 'volume' | 'stress' | 'radar'>('e1rm')

  // Charger les blocs de l'athlète
  useEffect(() => {
    if (!selectedAthleteId) return
    setBlocks([])
    setSelectedBlockIds([])
    setAnalyses([])
    fetch(`/api/blocks?athlete_id=${selectedAthleteId}`)
      .then(r => r.json())
      .then(setBlocks)
  }, [selectedAthleteId])

  async function runAnalysis() {
    if (selectedBlockIds.length === 0) return
    setLoading(true)

    const results: BlockAnalysis[] = []
    for (const blockId of selectedBlockIds) {
      const block = blocks.find(b => b.id === blockId)!

      // Charger sessions du bloc
      const sessionsRes = await fetch(`/api/sessions?athlete_id=${selectedAthleteId}`)
      const allSessions: Session[] = await sessionsRes.json()
      const blockSessions = allSessions.filter(s => s.block_id === blockId)

      // Charger sets pour chaque session
      const setsBySession: Record<string, Set[]> = {}
      await Promise.all(
        blockSessions.map(async s => {
          const r = await fetch(`/api/sessions/${s.id}/sets`)
          setsBySession[s.id] = r.ok ? await r.json() : []
        })
      )

      results.push(analyseBlock(block, blockSessions, setsBySession))
    }

    setAnalyses(results)
    setLoading(false)
  }

  function toggleBlock(id: string) {
    setSelectedBlockIds(prev =>
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id].slice(0, 4)
    )
  }

  // Construire les données pour les graphiques (semaine en axe X)
  const maxWeeks = Math.max(...analyses.map(a => a.weeks.length), 0)
  const chartData = Array.from({ length: maxWeeks }, (_, i) => {
    const row: Record<string, number | string | null> = { week: `S${i + 1}` }
    for (const analysis of analyses) {
      const w = analysis.weeks[i]
      if (!w) continue
      const label = analysis.block.name
      row[`${label}_e1rm_sq`] = w.e1rm_squat
      row[`${label}_e1rm_bp`] = w.e1rm_bench
      row[`${label}_e1rm_dl`] = w.e1rm_deadlift
      row[`${label}_vol`] = Math.round(w.volume_total)
      row[`${label}_cs`] = Math.round(w.central_stress * 10) / 10
      row[`${label}_ps`] = Math.round(w.peripheral_stress * 10) / 10
      row[`${label}_ts`] = Math.round(w.total_stress * 10) / 10
    }
    return row
  })

  // Données radar (moy/bloc)
  const radarData = [
    { metric: 'CS moy', ...Object.fromEntries(analyses.map(a => [a.block.name, Math.round(a.weeks.reduce((s, w) => s + w.central_stress, 0) / (a.weeks.length || 1) * 10) / 10])) },
    { metric: 'PS moy', ...Object.fromEntries(analyses.map(a => [a.block.name, Math.round(a.weeks.reduce((s, w) => s + w.peripheral_stress, 0) / (a.weeks.length || 1) * 10) / 10])) },
    { metric: 'TS moy', ...Object.fromEntries(analyses.map(a => [a.block.name, Math.round(a.weeks.reduce((s, w) => s + w.total_stress, 0) / (a.weeks.length || 1) * 10) / 10])) },
    { metric: 'Vol/sem (k)', ...Object.fromEntries(analyses.map(a => [a.block.name, Math.round(a.weeks.reduce((s, w) => s + w.volume_total, 0) / (a.weeks.length || 1) / 100) / 10])) },
    { metric: 'RPE moy', ...Object.fromEntries(analyses.map(a => {
      const rpees = a.weeks.map(w => w.avg_rpe).filter((v): v is number => v != null)
      return [a.block.name, rpees.length > 0 ? Math.round(rpees.reduce((s, r) => s + r, 0) / rpees.length * 10) / 10 : 0]
    })) },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Analyse & Méta-analyse</h1>

      {/* Sélection athlète + blocs */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Athlète</label>
          <select
            value={selectedAthleteId}
            onChange={e => setSelectedAthleteId(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            {athletes.map(a => (
              <option key={a.id} value={a.id}>{a.full_name}</option>
            ))}
          </select>
        </div>

        {blocks.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
              Blocs à comparer (max 4)
            </label>
            <div className="flex flex-wrap gap-2">
              {blocks.map(b => (
                <button
                  key={b.id}
                  onClick={() => toggleBlock(b.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                    selectedBlockIds.includes(b.id)
                      ? 'bg-orange-600 border-orange-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
                  }`}
                >
                  {b.name}
                  <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                    b.type === 'Accumulation' ? 'bg-blue-900 text-blue-300' :
                    b.type === 'Intensification' ? 'bg-purple-900 text-purple-300' :
                    b.type === 'Réalisation' ? 'bg-orange-900 text-orange-300' :
                    'bg-gray-700 text-gray-400'
                  }`}>
                    {b.type}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {blocks.length === 0 && selectedAthleteId && (
          <p className="text-gray-500 text-sm">Aucun bloc trouvé pour cet athlète.</p>
        )}

        <button
          onClick={runAnalysis}
          disabled={selectedBlockIds.length === 0 || loading}
          className="px-5 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white font-semibold rounded-lg text-sm transition-colors"
        >
          {loading ? 'Analyse en cours...' : 'Analyser'}
        </button>
      </div>

      {/* Résultats */}
      {analyses.length > 0 && (
        <>
          {/* Onglets graphiques */}
          <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
            {(['e1rm', 'volume', 'stress', 'radar'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveChart(tab)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeChart === tab
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {tab === 'e1rm' ? 'e1RM' : tab === 'volume' ? 'Volume' : tab === 'stress' ? 'Stress' : 'Radar'}
              </button>
            ))}
          </div>

          {/* Graphique e1RM */}
          {activeChart === 'e1rm' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-white font-semibold mb-1">e1RM par semaine</h2>
              <p className="text-gray-500 text-xs mb-4">Comparaison S1vsS1, S2vsS2…</p>
              {['Squat', 'Bench', 'Deadlift'].map((lift) => {
                const suffixes = { Squat: '_e1rm_sq', Bench: '_e1rm_bp', Deadlift: '_e1rm_dl' } as const
                const suffix = suffixes[lift as keyof typeof suffixes]
                return (
                  <div key={lift} className="mb-6">
                    <p className="text-gray-400 text-sm mb-2">{lift}</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="week" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                        <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} unit=" kg" />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                          labelStyle={{ color: '#f3f4f6' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        {analyses.map((a, i) => (
                          <Line
                            key={a.block.id}
                            type="monotone"
                            dataKey={`${a.block.name}${suffix}`}
                            name={a.block.name}
                            stroke={COLORS[i % COLORS.length]}
                            strokeWidth={2}
                            dot={{ r: 4 }}
                            connectNulls
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )
              })}
            </div>
          )}

          {/* Graphique Volume */}
          {activeChart === 'volume' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-white font-semibold mb-4">Volume-load total par semaine (kg)</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="week" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                    labelStyle={{ color: '#f3f4f6' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  {analyses.map((a, i) => (
                    <Bar
                      key={a.block.id}
                      dataKey={`${a.block.name}_vol`}
                      name={a.block.name}
                      fill={COLORS[i % COLORS.length]}
                      opacity={0.85}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>

              {/* Tableau récapitulatif */}
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left py-2 px-3 text-gray-500">Bloc</th>
                      <th className="text-right py-2 px-3 text-gray-500">Vol. total</th>
                      <th className="text-right py-2 px-3 text-gray-500">Vol. moy/sem</th>
                      <th className="text-right py-2 px-3 text-gray-500">Sem. max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analyses.map((a, i) => {
                      const vols = a.weeks.map(w => w.volume_total)
                      const total = vols.reduce((s, v) => s + v, 0)
                      const avg = total / (a.weeks.length || 1)
                      const max = Math.max(...vols)
                      const maxWeek = vols.indexOf(max) + 1
                      return (
                        <tr key={a.block.id} className="border-b border-gray-800/50">
                          <td className="py-2 px-3">
                            <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            <span className="text-white">{a.block.name}</span>
                          </td>
                          <td className="py-2 px-3 text-right text-gray-300 font-mono">{Math.round(total).toLocaleString()} kg</td>
                          <td className="py-2 px-3 text-right text-gray-300 font-mono">{Math.round(avg).toLocaleString()} kg</td>
                          <td className="py-2 px-3 text-right text-gray-300 font-mono">S{maxWeek} ({Math.round(max).toLocaleString()} kg)</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Graphique Stress */}
          {activeChart === 'stress' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-6">
              <h2 className="text-white font-semibold">Stress par semaine</h2>
              {[
                { key: '_cs', label: 'Central Stress', color: '#3b82f6' },
                { key: '_ps', label: 'Peripheral Stress', color: '#eab308' },
                { key: '_ts', label: 'Total Stress', color: '#8b5cf6' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <p className="text-gray-400 text-sm mb-2">{label}</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="week" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                      <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                        labelStyle={{ color: '#f3f4f6' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      {analyses.map((a, i) => (
                        <Line
                          key={a.block.id}
                          type="monotone"
                          dataKey={`${a.block.name}${key}`}
                          name={a.block.name}
                          stroke={COLORS[i % COLORS.length]}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ))}

              {/* Tableau stress max/moy par bloc */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left py-2 px-3 text-gray-500">Bloc</th>
                      <th className="text-right py-2 px-3 text-blue-400">CS max</th>
                      <th className="text-right py-2 px-3 text-blue-400">CS moy</th>
                      <th className="text-right py-2 px-3 text-yellow-400">PS max</th>
                      <th className="text-right py-2 px-3 text-yellow-400">PS moy</th>
                      <th className="text-right py-2 px-3 text-purple-400">TS max</th>
                      <th className="text-right py-2 px-3 text-purple-400">TS moy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analyses.map((a, i) => {
                      const cs = a.weeks.map(w => w.central_stress)
                      const ps = a.weeks.map(w => w.peripheral_stress)
                      const ts = a.weeks.map(w => w.total_stress)
                      const avg = (arr: number[]) => arr.length ? (arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(1) : '—'
                      const max = (arr: number[]) => arr.length ? Math.max(...arr).toFixed(1) : '—'
                      return (
                        <tr key={a.block.id} className="border-b border-gray-800/50">
                          <td className="py-2 px-3">
                            <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            <span className="text-white">{a.block.name}</span>
                          </td>
                          <td className="py-2 px-3 text-right text-blue-300 font-mono">{max(cs)}</td>
                          <td className="py-2 px-3 text-right text-blue-300/70 font-mono">{avg(cs)}</td>
                          <td className="py-2 px-3 text-right text-yellow-300 font-mono">{max(ps)}</td>
                          <td className="py-2 px-3 text-right text-yellow-300/70 font-mono">{avg(ps)}</td>
                          <td className="py-2 px-3 text-right text-purple-300 font-mono">{max(ts)}</td>
                          <td className="py-2 px-3 text-right text-purple-300/70 font-mono">{avg(ts)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Radar */}
          {activeChart === 'radar' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-white font-semibold mb-1">Vue radar — comparaison blocs</h2>
              <p className="text-gray-500 text-xs mb-4">Moyennes par bloc normalisées</p>
              <ResponsiveContainer width="100%" height={350}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#374151" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  {analyses.map((a, i) => (
                    <Radar
                      key={a.block.id}
                      name={a.block.name}
                      dataKey={a.block.name}
                      stroke={COLORS[i % COLORS.length]}
                      fill={COLORS[i % COLORS.length]}
                      fillOpacity={0.15}
                    />
                  ))}
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}
