/* eslint-disable react/no-unescaped-entities */
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExerciseSelectorModal } from './ExerciseSelectorModal'
import { SlotCard } from './SlotCard'

// Helper to generate UUIDs client-side
function generateId(): string {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

interface Exercise {
  id: string
  name: string
  category: string
  coach_id: string | null
}

interface SetDraft {
  id: string
  target_weight: string
  target_reps: string
  target_rpe: string
}

interface SlotDraft {
  id: string
  exercise: Exercise | null
  sets: SetDraft[]
}

interface SessionDraft {
  id: string
  name: string
  date: string
  slots: SlotDraft[]
}

interface TraceurAlert {
  shouldWarn: boolean
  message: string
}

interface ProgrammeBuilderClientProps {
  athlete_id: string
  athlete_name: string
  traceursAlert: TraceurAlert
}

export function ProgrammeBuilderClient({
  athlete_id,
  athlete_name,
  traceursAlert,
}: ProgrammeBuilderClientProps) {
  const router = useRouter()

  const [programName, setProgramName] = useState('')
  const [blockType, setBlockType] = useState('Accumulation')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [sessions, setSessions] = useState<SessionDraft[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [showExerciseSelector, setShowExerciseSelector] = useState(false)

  const handleAddSession = () => {
    const newSession: SessionDraft = {
      id: generateId(),
      name: `Séance ${sessions.length + 1}`,
      date: startDate,
      slots: [],
    }
    setSessions([...sessions, newSession])
  }

  const handleRemoveSession = (sessionId: string) => {
    setSessions(sessions.filter((s) => s.id !== sessionId))
  }

  const handleUpdateSessionName = (sessionId: string, name: string) => {
    setSessions(
      sessions.map((s) => (s.id === sessionId ? { ...s, name } : s))
    )
  }

  const handleUpdateSessionDate = (sessionId: string, date: string) => {
    setSessions(
      sessions.map((s) => (s.id === sessionId ? { ...s, date } : s))
    )
  }

  const handleAddExerciseToSession = (exercise: Exercise) => {
    if (!selectedSessionId) return

    setSessions(
      sessions.map((session) => {
        if (session.id === selectedSessionId) {
          return {
            ...session,
            slots: [
              ...session.slots,
              {
                id: generateId(),
                exercise,
                sets: [
                  {
                    id: generateId(),
                    target_weight: '',
                    target_reps: '',
                    target_rpe: '',
                  },
                ],
              },
            ],
          }
        }
        return session
      })
    )
    setShowExerciseSelector(false)
  }

  const handleRemoveSlot = (sessionId: string, slotId: string) => {
    setSessions(
      sessions.map((session) => {
        if (session.id === sessionId) {
          return {
            ...session,
            slots: session.slots.filter((slot) => slot.id !== slotId),
          }
        }
        return session
      })
    )
  }

  const handleAddSetToSlot = (sessionId: string, slotId: string) => {
    setSessions(
      sessions.map((session) => {
        if (session.id === sessionId) {
          return {
            ...session,
            slots: session.slots.map((slot) => {
              if (slot.id === slotId) {
                return {
                  ...slot,
                  sets: [
                    ...slot.sets,
                    {
                      id: generateId(),
                      target_weight: '',
                      target_reps: '',
                      target_rpe: '',
                    },
                  ],
                }
              }
              return slot
            }),
          }
        }
        return session
      })
    )
  }

  const handleRemoveSet = (sessionId: string, slotId: string, setId: string) => {
    setSessions(
      sessions.map((session) => {
        if (session.id === sessionId) {
          return {
            ...session,
            slots: session.slots.map((slot) => {
              if (slot.id === slotId) {
                return {
                  ...slot,
                  sets: slot.sets.filter((s) => s.id !== setId),
                }
              }
              return slot
            }),
          }
        }
        return session
      })
    )
  }

  const handleUpdateSet = (
    sessionId: string,
    slotId: string,
    setId: string,
    field: string,
    value: string
  ) => {
    setSessions(
      sessions.map((session) => {
        if (session.id === sessionId) {
          return {
            ...session,
            slots: session.slots.map((slot) => {
              if (slot.id === slotId) {
                return {
                  ...slot,
                  sets: slot.sets.map((s) => {
                    if (s.id === setId) {
                      return { ...s, [field]: value }
                    }
                    return s
                  }),
                }
              }
              return slot
            }),
          }
        }
        return session
      })
    )
  }

  const handleCreateProgramme = async () => {
    setError('')

    // Validation
    if (!programName.trim()) {
      setError('Le nom du programme est requis')
      return
    }
    if (!startDate) {
      setError('La date de début est requise')
      return
    }
    if (!endDate) {
      setError('La date de fin est requise')
      return
    }
    if (new Date(startDate) >= new Date(endDate)) {
      setError('La date de fin doit être après la date de début')
      return
    }
    if (sessions.length === 0) {
      setError('Ajoutez au moins une séance')
      return
    }

    // Vérifier qu'au moins une séance a des exercices
    const hasExercises = sessions.some((s) => s.slots.length > 0)
    if (!hasExercises) {
      setError('Ajoutez au moins un exercice')
      return
    }

    setLoading(true)
    try {
      const payload = {
        athlete_id,
        program_name: programName.trim(),
        block_type: blockType,
        start_date: startDate,
        end_date: endDate,
        sessions: sessions.map((session) => ({
          name: session.name,
          date: session.date,
          sets: session.slots.flatMap((slot, slotIdx) =>
            slot.exercise && slot.sets.length > 0
              ? slot.sets.map((set, setIdx) => ({
                  exercise_id: slot.exercise!.id,
                  exercise_name: slot.exercise!.name,
                  target_weight: set.target_weight
                    ? parseFloat(set.target_weight)
                    : null,
                  target_reps: set.target_reps ? parseInt(set.target_reps) : null,
                  target_rpe: set.target_rpe
                    ? parseFloat(set.target_rpe)
                    : null,
                  order_index: slotIdx * 100 + setIdx,
                }))
              : []
          ),
        })),
      }

      const response = await fetch('/api/programmes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const result = await response.json()
        setError(result.error?.message || 'Erreur de création')
        return
      }

      // Succès
      router.push(`/coach/athletes/${athlete_id}?success=Programme créé avec succès`)
    } catch (err) {
      setError('Erreur lors de la création du programme')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-4xl mx-auto">
        {/* En-tête */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="text-gray-400 hover:text-white text-sm mb-4"
          >
            ← Retour
          </button>
          <h1 className="text-3xl font-bold text-white">Créer un programme</h1>
          <p className="text-gray-400 mt-2">Athlète: {athlete_name}</p>
        </div>

        {/* Alerte traceurs */}
        {traceursAlert.shouldWarn && (
          <div className="mb-6 bg-orange-900/30 border border-orange-700 rounded-lg p-4">
            <p className="text-orange-300 text-sm font-medium">⚠️ {traceursAlert.message}</p>
            <p className="text-orange-300/70 text-xs mt-1">
              L'athlète pourrait ne pas être en condition optimale pour ce programme
            </p>
          </div>
        )}

        {/* Configuration programme */}
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 mb-8">
          <h2 className="text-lg font-semibold text-white mb-6">Configuration du programme</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-2">
                Nom du programme
              </label>
              <input
                type="text"
                placeholder="Ex: Upper Body - Phase 1"
                value={programName}
                onChange={(e) => setProgramName(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-2">Type de bloc</label>
              <select
                value={blockType}
                onChange={(e) => setBlockType(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              >
                <option>Accumulation</option>
                <option>Intensification</option>
                <option>Réalisation</option>
                <option>Deload</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-2">
                Date de début
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-2">Date de fin</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
          </div>

          {error && <div className="text-red-400 text-sm mb-4">{error}</div>}
        </div>

        {/* Sessions */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-white">Séances</h2>
            <button
              onClick={handleAddSession}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white font-medium rounded-lg text-sm transition"
            >
              + Ajouter une séance
            </button>
          </div>

          {sessions.length === 0 ? (
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-8 text-center text-gray-400">
              Aucune séance. Cliquez sur "+ Ajouter une séance" pour commencer.
            </div>
          ) : (
            <div className="space-y-6">
              {sessions.map((session, sessionIdx) => (
                <div
                  key={session.id}
                  className="bg-gray-900 border border-gray-700 rounded-2xl p-6"
                >
                  {/* En-tête séance */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={session.name}
                        onChange={(e) =>
                          handleUpdateSessionName(session.id, e.target.value)
                        }
                        className="font-semibold text-white bg-transparent border-b border-gray-700 pb-1 w-full focus:outline-none focus:border-orange-500"
                      />
                      <input
                        type="date"
                        value={session.date}
                        onChange={(e) => handleUpdateSessionDate(session.id, e.target.value)}
                        className="text-xs text-gray-400 bg-transparent mt-2 focus:outline-none"
                      />
                    </div>

                    <button
                      onClick={() => handleRemoveSession(session.id)}
                      className="text-gray-400 hover:text-red-500 text-2xl leading-none ml-4"
                    >
                      ×
                    </button>
                  </div>

                  {/* Exercices de la séance */}
                  <div className="mb-6">
                    {session.slots.length === 0 ? (
                      <div className="text-center text-gray-500 text-sm py-4">
                        Aucun exercice. Cliquez sur le bouton ci-dessous pour en ajouter.
                      </div>
                    ) : (
                      <div className="space-y-0">
                        {session.slots.map((slot, slotIdx) =>
                          slot.exercise ? (
                            <SlotCard
                              key={slot.id}
                              exercise={slot.exercise}
                              sets={slot.sets}
                              onAddSet={() =>
                                handleAddSetToSlot(session.id, slot.id)
                              }
                              onRemoveSet={(setId) =>
                                handleRemoveSet(session.id, slot.id, setId)
                              }
                              onUpdateSet={(setId, field, value) =>
                                handleUpdateSet(session.id, slot.id, setId, field, value)
                              }
                              onRemoveSlot={() =>
                                handleRemoveSlot(session.id, slot.id)
                              }
                              sessionIndex={sessionIdx}
                              slotIndex={slotIdx}
                            />
                          ) : null
                        )}
                      </div>
                    )}
                  </div>

                  {/* Bouton ajouter exercice */}
                  <button
                    onClick={() => {
                      setSelectedSessionId(session.id)
                      setShowExerciseSelector(true)
                    }}
                    className="w-full px-4 py-2 border border-gray-700 hover:border-orange-500 rounded-lg text-orange-500 font-medium text-sm transition"
                  >
                    + Ajouter un exercice
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            onClick={() => router.back()}
            className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition"
          >
            Annuler
          </button>
          <button
            onClick={handleCreateProgramme}
            disabled={loading}
            className="flex-1 px-6 py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition"
          >
            {loading ? 'Création en cours...' : 'Créer le programme'}
          </button>
        </div>

        {/* Modal sélecteur exercices */}
        {showExerciseSelector && (
          <ExerciseSelectorModal
            onSelect={handleAddExerciseToSession}
            onClose={() => setShowExerciseSelector(false)}
          />
        )}
      </div>
    </div>
  )
}
