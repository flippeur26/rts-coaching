'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/athlete/programme', label: 'Programme', icon: '🏋️' },
  { href: '/athlete/traceurs', label: 'Traceurs', icon: '📊' },
  { href: '/athlete/historique', label: 'Historique', icon: '📅' },
  { href: '/athlete/invitations', label: 'Coachs', icon: '✉️' },
]

export default function AthleteNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 safe-area-pb">
      <div className="flex justify-around items-center h-16 max-w-2xl mx-auto px-4">
        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
              pathname.startsWith(item.href)
                ? 'text-orange-500'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
