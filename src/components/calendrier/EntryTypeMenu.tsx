'use client'

/**
 * EntryTypeMenu — popup affichant les types d'entrées créables sur un jour :
 *   Workout · Bodyweight · TRAC entry · Note · Competition
 *
 * Reproduit le comportement de la maquette de référence (clic "+" → menu vertical).
 */

import { useEffect, useRef } from 'react'
import { Dumbbell, Scale, Activity, NotebookPen, Trophy, Bookmark } from '@/components/ui/Icon'

export type EntryType = 'workout' | 'workout_from_template' | 'bodyweight' | 'trac' | 'note' | 'competition'

export interface EntryTypeMenuProps {
  open: boolean
  /** position d'ancrage (px depuis bord top-left du conteneur calendrier) */
  anchor?: { top: number; left: number } | null
  onSelect: (type: EntryType) => void
  onClose: () => void
}

const ITEMS: { type: EntryType; label: string; Icon: typeof Dumbbell; color: string }[] = [
  { type: 'workout',               label: 'Workout',           Icon: Dumbbell,    color: 'var(--entry-workout)' },
  { type: 'workout_from_template', label: 'Workout (template)', Icon: Bookmark,   color: 'var(--entry-workout)' },
  { type: 'bodyweight',            label: 'Poids de corps',     Icon: Scale,      color: 'var(--entry-bw)' },
  { type: 'trac',                  label: 'TRAC entry',         Icon: Activity,   color: 'var(--entry-trac)' },
  { type: 'note',                  label: 'Note',               Icon: NotebookPen, color: 'var(--entry-note)' },
  { type: 'competition',           label: 'Compétition',        Icon: Trophy,     color: 'var(--entry-comp)' },
]

export default function EntryTypeMenu({ open, anchor, onSelect, onClose }: EntryTypeMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Fermer sur clic extérieur / Escape
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  const positioned = anchor
    ? { position: 'fixed' as const, top: anchor.top, left: anchor.left }
    : { position: 'absolute' as const, top: '100%', left: 0 }

  return (
    <div
      ref={ref}
      role="menu"
      style={positioned}
      className="z-50 w-52 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/95 shadow-xl backdrop-blur"
    >
      <ul className="py-1">
        {ITEMS.map(({ type, label, Icon, color }) => (
          <li key={type}>
            <button
              type="button"
              role="menuitem"
              onClick={() => { onSelect(type); onClose() }}
              className="flex w-full items-center gap-3 px-3 py-2 text-sm text-zinc-200 transition-colors hover:bg-zinc-800/70"
            >
              <Icon className="size-4" style={{ color }} />
              <span>{label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
