'use client'

import { useEffect, useState } from 'react'

interface CriticalAlert {
  athlete_id: string
  athlete_name: string
  exercise_name: string
  message: string
  level: string
}

interface AthleteInfo {
  id: string
  name: string
}

export function CriticalAlertsWidget({ athletes }: { athletes: AthleteInfo[] }) {
  const [alerts, setAlerts] = useState<CriticalAlert[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAllAlerts = async () => {
      try {
        const results = await Promise.all(
          athletes.map(async (athlete) => {
            const response = await fetch(`/api/athletes/${athlete.id}/programmes`)
            if (response.ok) {
              const data = await response.json()
              const programs = data.data?.programs || []

              type AlertItem = { level?: string; exercise_name?: string; message?: string; [k: string]: unknown }
              type ProgramItem = { performance_alerts?: AlertItem[] }
              return (programs as ProgramItem[])
                .flatMap<CriticalAlert>(p =>
                  (p.performance_alerts || []).map(alert => ({
                    athlete_id: athlete.id,
                    athlete_name: athlete.name,
                    exercise_name: alert.exercise_name ?? '',
                    message: alert.message ?? '',
                    level: alert.level ?? '',
                  }))
                )
                .filter(a => a.level === 'red') // Alertes critiques seulement
            }
            return []
          })
        )

        const allAlerts = results.flat().slice(0, 5) // Top 5 alertes critiques
        setAlerts(allAlerts)
      } catch (err) {
        console.error('Failed to fetch critical alerts:', err)
      } finally {
        setLoading(false)
      }
    }

    if (athletes.length > 0) {
      fetchAllAlerts()
    } else {
      setLoading(false)
    }
  }, [athletes])

  if (loading || alerts.length === 0) return null

  return (
    <div className="bg-red-950/40 border border-red-900 rounded-xl p-5 mb-8">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">🚨</span>
        <h2 className="text-lg font-semibold text-red-300">Alertes critiques</h2>
      </div>

      <div className="space-y-2">
        {alerts.map((alert, idx) => (
          <div
            key={idx}
            className="bg-red-900/30 rounded-lg p-3 text-sm text-red-200 border border-red-800"
          >
            <div className="font-medium">{alert.athlete_name}</div>
            <div className="text-red-300 text-xs mt-1">{alert.message}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
