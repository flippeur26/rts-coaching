'use client'

import { useEffect, useState, useRef } from 'react'

// Simple debounce helper
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null
  return function (...args: Parameters<T>) {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      func(...args)
    }, delay)
  }
}

interface Exercise {
  id: string
  name: string
  category: string
  coach_id: string | null
}

const CATEGORIES = [
  'Squat',
  'Hinge',
  'Horizontal Push',
  'Horizontal Pull',
  'Vertical Push',
  'Vertical Pull',
  'Accessoire',
  'Cardio',
]

interface ExerciseSelectorModalProps {
  onSelect: (exercise: Exercise) => void
  onClose: () => void
}

export function ExerciseSelectorModal({ onSelect, onClose }: ExerciseSelectorModalProps) {
  const [category, setCategory] = useState('Squat')
  const [search, setSearch] = useState('')
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showNewExercise, setShowNewExercise] = useState(false)
  const [newExerciseName, setNewExerciseName] = useState('')
  const [newExerciseCategory, setNewExerciseCategory] = useState('Squat')
  const [creatingExercise, setCreatingExercise] = useState(false)

  const debouncedFetchRef = useRef(
    debounce(async (cat: string, q: string) => {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams()
        if (cat) params.append('category', cat)
        if (q) params.append('search', q)

        const response = await fetch(`/api/exercises?${params}`)
        if (!response.ok) throw new Error('Erreur de chargement')

        const data = await response.json()
        // L'API renvoie le tableau directement (helper `ok(data)`)
        setExercises(Array.isArray(data) ? data : (data?.data ?? []))
      } catch (err) {
        setError('Impossible de charger les exercices')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }, 300)
  )

  useEffect(() => {
    debouncedFetchRef.current(category, search)
  }, [category, search])

  const handleCreateExercise = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newExerciseName.trim()) return

    setCreatingExercise(true)
    try {
      const response = await fetch('/api/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newExerciseName.trim(),
          category: newExerciseCategory,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        setError(error.error?.message || 'Erreur de création')
        return
      }

      const result = await response.json()
      const newExercise = result?.data ?? result
      onSelect(newExercise)
      setShowNewExercise(false)
      setNewExerciseName('')
    } catch (err) {
      setError('Erreur lors de la création')
      console.error(err)
    } finally {
      setCreatingExercise(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-md w-full max-h-[80svh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-white">Sélectionner un exercice</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {!showNewExercise ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-2">Catégorie</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-2">Rechercher</label>
                <input
                  type="text"
                  placeholder="Bench Press, Squat..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent placeholder-gray-500"
                />
              </div>
            </div>

            {/* Dropdown natif des exercices de la catégorie */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-300 mb-2">
                Exercice ({exercises.length})
              </label>
              <select
                size={Math.min(Math.max(exercises.length, 4), 10)}
                onChange={(e) => {
                  const ex = exercises.find(x => x.id === e.target.value)
                  if (ex) {
                    onSelect(ex)
                    onClose()
                  }
                }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              >
                {loading ? (
                  <option disabled>Chargement…</option>
                ) : exercises.length === 0 ? (
                  <option disabled>Aucun exercice trouvé</option>
                ) : (
                  exercises.map((exercise) => (
                    <option key={exercise.id} value={exercise.id}>
                      {exercise.name}
                      {exercise.coach_id ? '  (Custom)' : ''}
                    </option>
                  ))
                )}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">
                Cliquez sur un exercice pour le sélectionner.
              </p>
            </div>

            {error && <div className="text-red-400 text-sm mb-4">{error}</div>}

            <button
              onClick={() => setShowNewExercise(true)}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-sm transition"
            >
              + Créer un nouvel exercice
            </button>
          </>
        ) : (
          <form onSubmit={handleCreateExercise} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-2">Nom de l&apos;exercice</label>
              <input
                type="text"
                placeholder="Ex: Bench Press"
                value={newExerciseName}
                onChange={(e) => setNewExerciseName(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-2">Catégorie</label>
              <select
                value={newExerciseCategory}
                onChange={(e) => setNewExerciseCategory(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {error && <div className="text-red-400 text-sm">{error}</div>}

            <div className="flex gap-2 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowNewExercise(false)
                  setNewExerciseName('')
                  setError('')
                }}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg text-sm transition"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={creatingExercise || !newExerciseName.trim()}
                className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg text-sm transition"
              >
                {creatingExercise ? 'Création...' : 'Créer'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
