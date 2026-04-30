'use client'

import { useState } from 'react'

interface SetDraft {
  id: string
  target_weight: string
  target_reps: string
  target_rpe: string
}

interface Exercise {
  id: string
  name: string
  category: string
  coach_id: string | null
}

interface SlotCardProps {
  exercise: Exercise
  sets: SetDraft[]
  onAddSet: () => void
  onRemoveSet: (setId: string) => void
  onUpdateSet: (setId: string, field: string, value: string) => void
  onRemoveSlot: () => void
  sessionIndex?: number
  slotIndex?: number
}

export function SlotCard({
  exercise,
  sets,
  onAddSet,
  onRemoveSet,
  onUpdateSet,
  onRemoveSlot,
}: SlotCardProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
      {/* En-tête */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-1 text-left"
        >
          <h3 className="font-medium text-white text-sm">
            {exercise.name}
            {exercise.coach_id && <span className="text-xs text-gray-400 ml-2">(Custom)</span>}
          </h3>
          <p className="text-xs text-gray-400 mt-1">{exercise.category}</p>
        </button>

        <div className="flex gap-2 ml-4">
          <button
            onClick={onAddSet}
            className="text-gray-400 hover:text-orange-500 text-xl"
            title="Ajouter un set"
          >
            +
          </button>
          <button
            onClick={onRemoveSlot}
            className="text-gray-400 hover:text-red-500 text-xl"
            title="Supprimer l'exercice"
          >
            ×
          </button>
        </div>
      </div>

      {/* Sets */}
      {isExpanded && (
        <div className="space-y-3">
          {sets.length === 0 ? (
            <div className="text-center text-gray-500 text-xs py-2">
              Aucun set. Cliquez sur + pour en ajouter.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-400 mb-2">
                <div className="col-span-2">Set</div>
                <div className="col-span-3">Poids (kg)</div>
                <div className="col-span-3">Reps</div>
                <div className="col-span-3">RPE</div>
                <div className="col-span-1"></div>
              </div>

              {sets.map((set, idx) => (
                <div key={set.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-2 text-xs text-gray-400 font-medium">{idx + 1}</div>

                  <input
                    type="number"
                    step="0.5"
                    placeholder="0"
                    value={set.target_weight}
                    onChange={(e) => onUpdateSet(set.id, 'target_weight', e.target.value)}
                    className="col-span-3 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white text-center focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />

                  <input
                    type="number"
                    min="1"
                    placeholder="0"
                    value={set.target_reps}
                    onChange={(e) => onUpdateSet(set.id, 'target_reps', e.target.value)}
                    className="col-span-3 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white text-center focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />

                  <input
                    type="number"
                    min="1"
                    max="10"
                    step="0.5"
                    placeholder="0"
                    value={set.target_rpe}
                    onChange={(e) => onUpdateSet(set.id, 'target_rpe', e.target.value)}
                    className="col-span-3 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white text-center focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />

                  <button
                    onClick={() => onRemoveSet(set.id)}
                    className="col-span-1 text-gray-400 hover:text-red-500 text-center"
                  >
                    ×
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
