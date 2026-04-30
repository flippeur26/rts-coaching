import { Suspense } from 'react'
import InvitationsClient from '@/components/athlete/InvitationsClient'

export const dynamic = 'force-dynamic'

export default function AthleteInvitationsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Mes coachs</h1>
        <p className="mt-1 text-sm text-gray-400">
          Gérez les invitations et les coachs liés à votre compte.
        </p>
      </header>

      <Suspense fallback={<p className="text-gray-500 text-sm">Chargement…</p>}>
        <InvitationsClient />
      </Suspense>
    </div>
  )
}
