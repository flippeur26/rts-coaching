'use client'

import { useEffect, useState } from 'react'

interface PerformanceAlert {
  exercise_name: string
  type: string
  level: string
  message: string
}

export function AthleteAlertBadge({ athleteId }: { athleteId: string }) {
  const [alerts, setAlerts] = useState<PerformanceAlert[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const response = await fetch(`/api/athletes/${athleteId}/programmes`)
        if (response.ok) {
          const data = await response.json()
          const programs = data.data?.programs || []

          // Collecte toutes les alertes de tous les programmes
          const allAlerts: PerformanceAlert[] = []
          for (const program of programs) {
            allAlerts.push(...(program.performance_alerts || []))
          }

          setAlerts(allAlerts.slice(0, 3)) // Top 3 alertes
        }
      } catch (err) {
        console.error('Failed to fetch alerts:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchAlerts()
  }, [athleteId])

  if (loading || alerts.length === 0) return null

  const hasRedAlerts = alerts.some((a) => a.level === 'red')

  return (
    <div className={`mt-3 text-xs space-y-1 ${hasRedAlerts ? 'text-red-400' : 'text-orange-400'}`}>
      <div className="font-medium">Alertes de performance:</div>
      {alerts.map((alert, idx) => (
        <div key={idx} className="text-gray-300 truncate">
          {alert.exercise_name}: {alert.message.split(':').pop()?.trim()}
        </div>
      ))}
    </div>
  )
}
