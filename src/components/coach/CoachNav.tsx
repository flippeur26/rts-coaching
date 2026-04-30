'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Nav coach épurée — l'écran principal est `/coach` (sélecteur d'athlètes).
 * Tout le travail (calendrier, dashboard, traceurs, blocs) est ensuite
 * sous `/coach/athletes/[id]/...`, donc géré par AthleteSubNav.
 */
const navItems = [
  { href: '/coach',          label: 'Athlètes' },
  { href: '/coach/analyse',  label: 'Analyse globale' },
]

export default function CoachNav({ userName }: { userName: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="border-b border-zinc-800 bg-zinc-950">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/coach" className="font-bold text-orange-500">RTS</Link>
          <div className="hidden gap-1 md:flex">
            {navItems.map(item => {
              const active =
                item.href === '/coach'
                  ? pathname === '/coach' || pathname.startsWith('/coach/athletes')
                  : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-sm text-zinc-400 sm:block">{userName}</span>
          <button onClick={handleLogout} className="text-sm text-zinc-400 transition-colors hover:text-white">
            Déconnexion
          </button>
        </div>
      </div>
    </nav>
  )
}
