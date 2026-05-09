'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { WeeklyCompliance } from '@/lib/compliance'

interface Props {
  data: WeeklyCompliance[]
}

export default function WeeklyComplianceChart({ data }: Props) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
      <h2 className="mb-4 text-xs uppercase tracking-wider text-zinc-400">Sets effectués / semaine</h2>
      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -24 }}>
          <XAxis
            dataKey="week_label"
            tick={{ fontSize: 11, fill: '#71717a' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: '#71717a' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#a1a1aa' }}
            formatter={(v: number) => [`${v}%`, 'Sets effectués']}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          />
          <Bar dataKey="sets_done_pct" radius={[4, 4, 0, 0]} maxBarSize={48}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.sets_done_pct >= 80 ? '#10b981' : entry.sets_done_pct >= 60 ? '#f97316' : '#ef4444'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
