'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, Activity, Heart, Dumbbell, ChevronLeft } from '@/components/ui/Icon'

interface Props {
  athleteId: string
  athleteName: string
}

export default function AthleteSubNav({ athleteId, athleteName }: Props) {
  const pathname = usePathname()
  const base = `/coach/athletes/${athleteId}`

  const items = [
    { href: base,                  label: 'Profil',     Icon: Activity,     match: (p: string) => p === base },
    { href: `${base}/dashboard`,   label: 'Dashboard',  Icon: Activity,     match: (p: string) => p.startsWith(`${base}/dashboard`) },
    { href: `${base}/calendrier`,  label: 'Calendrier', Icon: CalendarDays, match: (p: string) => p.startsWith(`${base}/calendrier`) },
    { href: `${base}/traceurs`,    label: 'Traceurs',   Icon: Heart,        match: (p: string) => p.startsWith(`${base}/traceurs`) },
    { href: `${base}/blocs`,       label: 'Blocs',      Icon: Dumbbell,     match: (p: string) => p.startsWith(`${base}/blocs`) },
  ]

  return (
    <div className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8 py-2.5">
        <Link
          href="/coach"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          title="Retour à la liste"
        >
          <ChevronLeft className="size-4" />
          <span className="hidden sm:inline">Tous</span>
        </Link>

        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-700 to-orange-900 text-sm font-semibold text-white">
            {athleteName.charAt(0).toUpperCase()}
          </div>
          <span className="truncate font-medium text-white">{athleteName}</span>
        </div>

        <div className="ml-auto flex items-center gap-1 overflow-x-auto">
          {items.map(({ href, label, Icon, match }) => {
            const active = match(pathname)
            return (
              <Link
                key={href}
                href={href}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? 'bg-orange-600/15 text-orange-400'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                }`}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
