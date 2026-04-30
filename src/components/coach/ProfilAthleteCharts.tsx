'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import type { DailyTracker } from '@/types/database'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

interface Props {
  bodyweightData: { date: string; kg: number | null }[]
  trackers: DailyTracker[]
}

export default function ProfilAthleteCharts({ bodyweightData, trackers }: Props) {
  const fatigueData = trackers
    .filter(t => t.general_fatigue != null || t.motivation != null || t.recovery != null)
    .slice(0, 30)
    .reverse()
    .map(t => ({
      date: format(parseISO(t.date), 'd MMM', { locale: fr }),
      fatigue: t.general_fatigue,
      motivation: t.motivation,
      récupération: t.recovery,
    }))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Courbe poids de corps */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">
          Poids de corps — 30 jours
        </h2>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={bodyweightData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              domain={['auto', 'auto']}
              unit=" kg"
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
              labelStyle={{ color: '#f3f4f6' }}
              formatter={(v) => [`${v} kg`, 'Poids']}
            />
            <Line
              type="monotone"
              dataKey="kg"
              stroke="#f97316"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Traceurs fatigue/motivation/récup */}
      {fatigueData.length > 1 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">
            Traceurs — 30 jours
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={fatigueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                labelStyle={{ color: '#f3f4f6' }}
              />
              <Line type="monotone" dataKey="fatigue" stroke="#ef4444" strokeWidth={1.5} dot={false} name="Fatigue" />
              <Line type="monotone" dataKey="motivation" stroke="#22c55e" strokeWidth={1.5} dot={false} name="Motivation" />
              <Line type="monotone" dataKey="récupération" stroke="#3b82f6" strokeWidth={1.5} dot={false} name="Récupération" />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 text-xs">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-500 inline-block" /> Fatigue</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-500 inline-block" /> Motivation</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-500 inline-block" /> Récupération</span>
          </div>
        </div>
      )}
    </div>
  )
}
