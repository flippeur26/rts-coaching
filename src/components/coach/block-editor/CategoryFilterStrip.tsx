'use client'

import { CATEGORY_FILTERS, CATEGORY_FILTER_LABELS, type CategoryFilter } from '@/lib/category-filter'

interface Props {
  value: CategoryFilter
  onChange: (v: CategoryFilter) => void
}

export default function CategoryFilterStrip({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2">
      <span className="mr-2 text-[10px] uppercase tracking-wider text-zinc-500">Filtre catégorie</span>
      {CATEGORY_FILTERS.map(f => {
        const isActive = f === value
        return (
          <button
            key={f}
            onClick={() => onChange(f)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? 'border-orange-500/60 bg-orange-500/10 text-orange-300'
                : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800'
            }`}
            aria-pressed={isActive}
          >
            {CATEGORY_FILTER_LABELS[f]}
          </button>
        )
      })}
    </div>
  )
}
