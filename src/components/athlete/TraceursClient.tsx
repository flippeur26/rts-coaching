'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { DailyTracker } from '@/types/database'

interface Props {
  todayDate: string
  todayTracker: DailyTracker | null
  history: DailyTracker[]
}

type ScaleField = 'general_fatigue' | 'squat_fatigue' | 'bench_fatigue' | 'deadlift_fatigue' | 'motivation' | 'recovery'
type Scale10Field = 'sleep_quality'

interface FormState {
  general_fatigue: number | null
  squat_fatigue: number | null
  bench_fatigue: number | null
  deadlift_fatigue: number | null
  motivation: number | null
  recovery: number | null
  sleep_quality: number | null
  sleep_duration_h: string
  sleep_duration_min: string
  bodyweight_kg: string
  notes: string
}

function initForm(t: DailyTracker | null): FormState {
  const totalMin = t?.sleep_duration_min ?? null
  return {
    general_fatigue: t?.general_fatigue ?? null,
    squat_fatigue: t?.squat_fatigue ?? null,
    bench_fatigue: t?.bench_fatigue ?? null,
    deadlift_fatigue: t?.deadlift_fatigue ?? null,
    motivation: t?.motivation ?? null,
    recovery: t?.recovery ?? null,
    sleep_quality: t?.sleep_quality ?? null,
    sleep_duration_h: totalMin != null ? Math.floor(totalMin / 60).toString() : '',
    sleep_duration_min: totalMin != null ? (totalMin % 60).toString() : '',
    bodyweight_kg: t?.bodyweight_kg?.toString() ?? '',
    notes: t?.notes ?? '',
  }
}

export default function TraceursClient({ todayDate, todayTracker, history }: Props) {
  const [form, setForm] = useState<FormState>(initForm(todayTracker))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function setScale(field: ScaleField, value: number) {
    setForm(f => ({ ...f, [field]: f[field] === value ? null : value }))
  }

  function setScale10(field: Scale10Field, value: number) {
    setForm(f => ({ ...f, [field]: f[field] === value ? null : value }))
  }

  async function handleSave() {
    setSaving(true)
    const h = parseInt(form.sleep_duration_h) || 0
    const m = parseInt(form.sleep_duration_min) || 0
    const sleepMin = (h > 0 || m > 0) ? h * 60 + m : null

    await fetch('/api/traceurs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: todayDate,
        general_fatigue: form.general_fatigue,
        squat_fatigue: form.squat_fatigue,
        bench_fatigue: form.bench_fatigue,
        deadlift_fatigue: form.deadlift_fatigue,
        motivation: form.motivation,
        recovery: form.recovery,
        sleep_quality: form.sleep_quality,
        sleep_duration_min: sleepMin,
        bodyweight_kg: form.bodyweight_kg ? parseFloat(form.bodyweight_kg) : null,
        notes: form.notes || null,
      }),
    })

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Traceurs du jour</h1>
        <p className="text-gray-400 text-sm mt-1">
          {format(parseISO(todayDate), 'EEEE d MMMM yyyy', { locale: fr })}
        </p>
      </div>

      {/* Fatigue générale */}
      <Section title="Fatigue générale">
        <ScaleButtons value={form.general_fatigue} max={5} onChange={v => setScale('general_fatigue', v)} colorFatigue />
      </Section>

      {/* Fatigue par lift */}
      <Section title="Fatigue musculaire">
        <div className="space-y-3">
          {(['squat_fatigue', 'bench_fatigue', 'deadlift_fatigue'] as ScaleField[]).map(field => (
            <div key={field} className="flex items-center gap-4">
              <span className="text-gray-300 text-sm w-20 shrink-0">
                {field === 'squat_fatigue' ? 'Squat' : field === 'bench_fatigue' ? 'Bench' : 'Deadlift'}
              </span>
              <ScaleButtons value={form[field]} max={5} onChange={v => setScale(field, v)} colorFatigue />
            </div>
          ))}
        </div>
      </Section>

      {/* Motivation & Récupération */}
      <Section title="Motivation">
        <ScaleButtons value={form.motivation} max={5} onChange={v => setScale('motivation', v)} colorMotivation />
      </Section>

      <Section title="Récupération perçue">
        <ScaleButtons value={form.recovery} max={5} onChange={v => setScale('recovery', v)} colorRecovery />
      </Section>

      {/* Sommeil */}
      <Section title="Sommeil">
        <div className="space-y-4">
          <div>
            <p className="text-gray-400 text-sm mb-2">Durée</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={form.sleep_duration_h}
                onChange={e => setForm(f => ({ ...f, sleep_duration_h: e.target.value }))}
                placeholder="7"
                min={0}
                max={24}
                className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white text-center text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <span className="text-gray-400 text-sm">h</span>
              <input
                type="number"
                value={form.sleep_duration_min}
                onChange={e => setForm(f => ({ ...f, sleep_duration_min: e.target.value }))}
                placeholder="30"
                min={0}
                max={59}
                className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white text-center text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <span className="text-gray-400 text-sm">min</span>
            </div>
          </div>
          <div>
            <p className="text-gray-400 text-sm mb-2">Qualité (1–10)</p>
            <ScaleButtons10 value={form.sleep_quality} onChange={v => setScale10('sleep_quality', v)} />
          </div>
        </div>
      </Section>

      {/* Poids de corps */}
      <Section title="Poids de corps">
        <div className="flex items-center gap-3">
          <input
            type="number"
            value={form.bodyweight_kg}
            onChange={e => setForm(f => ({ ...f, bodyweight_kg: e.target.value }))}
            step="0.1"
            placeholder="82.5"
            className="w-28 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-center text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <span className="text-gray-400 text-sm">kg</span>
        </div>
      </Section>

      {/* Notes libres */}
      <Section title="Notes">
        <textarea
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          rows={3}
          placeholder="Observations, douleurs, état général..."
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
        />
      </Section>

      {/* Bouton sauvegarder */}
      <button
        onClick={handleSave}
        disabled={saving}
        className={`w-full py-4 font-bold text-base rounded-xl transition-colors ${
          saved
            ? 'bg-green-700 text-white'
            : 'bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white'
        }`}
      >
        {saved ? 'Sauvegardé ✓' : saving ? 'Sauvegarde...' : 'Sauvegarder'}
      </button>

      {/* Historique 7 derniers jours */}
      {history.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
            Historique récent
          </h2>
          <div className="space-y-2">
            {history.slice(0, 7).map(t => (
              <div key={t.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center justify-between">
                <span className="text-gray-300 text-sm">
                  {format(parseISO(t.date), 'EEE d MMM', { locale: fr })}
                </span>
                <div className="flex gap-3 text-xs">
                  {t.general_fatigue != null && (
                    <span className={`font-mono ${t.general_fatigue >= 4 ? 'text-red-400' : t.general_fatigue >= 3 ? 'text-yellow-400' : 'text-green-400'}`}>
                      F{t.general_fatigue}
                    </span>
                  )}
                  {t.motivation != null && (
                    <span className={`font-mono ${t.motivation <= 2 ? 'text-red-400' : t.motivation <= 3 ? 'text-yellow-400' : 'text-green-400'}`}>
                      M{t.motivation}
                    </span>
                  )}
                  {t.bodyweight_kg != null && (
                    <span className="text-gray-400 font-mono">{t.bodyweight_kg}kg</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  )
}

function ScaleButtons({
  value, max, onChange, colorFatigue, colorMotivation, colorRecovery
}: {
  value: number | null
  max: number
  onChange: (v: number) => void
  colorFatigue?: boolean
  colorMotivation?: boolean
  colorRecovery?: boolean
}) {
  return (
    <div className="flex gap-2">
      {Array.from({ length: max }, (_, i) => i + 1).map(v => {
        const isActive = value === v
        let activeClass = 'bg-orange-600 text-white'
        if (colorFatigue) {
          activeClass = v <= 2 ? 'bg-green-700 text-white' : v === 3 ? 'bg-yellow-600 text-white' : 'bg-red-700 text-white'
        } else if (colorMotivation) {
          activeClass = v >= 4 ? 'bg-green-700 text-white' : v === 3 ? 'bg-yellow-600 text-white' : 'bg-red-700 text-white'
        } else if (colorRecovery) {
          activeClass = v >= 4 ? 'bg-green-700 text-white' : v === 3 ? 'bg-yellow-600 text-white' : 'bg-red-700 text-white'
        }

        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`w-12 h-12 rounded-xl font-bold text-lg transition-all ${
              isActive ? activeClass : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300'
            }`}
          >
            {v}
          </button>
        )
      })}
    </div>
  )
}

function ScaleButtons10({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: 10 }, (_, i) => i + 1).map(v => {
        const isActive = value === v
        const activeClass = v >= 8 ? 'bg-green-700 text-white' : v >= 6 ? 'bg-yellow-600 text-white' : 'bg-red-700 text-white'
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`w-10 h-10 rounded-lg font-bold text-sm transition-all ${
              isActive ? activeClass : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
            }`}
          >
            {v}
          </button>
        )
      })}
    </div>
  )
}
