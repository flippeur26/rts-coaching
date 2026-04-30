'use client'

import { useEffect, useState } from 'react'

type Invitation = {
  coach_id: string
  athlete_id: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
  accepted_at: string | null
  rejected_at: string | null
  other_party: { id: string; full_name: string; email: string } | null
}

export default function InvitationsClient() {
  const [invitations, setInvitations] = useState<Invitation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyCoachId, setBusyCoachId] = useState<string | null>(null)

  async function load() {
    setError(null)
    const res = await fetch('/api/athletes/invitations', { cache: 'no-store' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Erreur de chargement')
      return
    }
    setInvitations(await res.json())
  }

  useEffect(() => {
    void load()
  }, [])

  async function respond(coachId: string, action: 'accept' | 'reject') {
    setBusyCoachId(coachId)
    const res = await fetch(`/api/athletes/invitations/${coachId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    setBusyCoachId(null)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Erreur')
      return
    }
    await load()
  }

  async function unlink(coachId: string) {
    if (!confirm('Supprimer ce lien ? Le coach ne verra plus vos données.')) return
    setBusyCoachId(coachId)
    const res = await fetch(`/api/athletes/invitations/${coachId}`, { method: 'DELETE' })
    setBusyCoachId(null)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Erreur')
      return
    }
    await load()
  }

  if (invitations === null) {
    return <p className="text-gray-500 text-sm">Chargement…</p>
  }

  const pending = invitations.filter(i => i.status === 'pending')
  const accepted = invitations.filter(i => i.status === 'accepted')
  const rejected = invitations.filter(i => i.status === 'rejected')

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <Section title="Invitations en attente" count={pending.length}>
        {pending.length === 0 ? (
          <Empty>Aucune invitation en attente.</Empty>
        ) : (
          pending.map(i => (
            <Card key={i.coach_id} invitation={i}>
              <div className="flex gap-2">
                <button
                  disabled={busyCoachId === i.coach_id}
                  onClick={() => respond(i.coach_id, 'accept')}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  Accepter
                </button>
                <button
                  disabled={busyCoachId === i.coach_id}
                  onClick={() => respond(i.coach_id, 'reject')}
                  className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 text-sm font-semibold rounded-lg border border-gray-700 transition-colors"
                >
                  Refuser
                </button>
              </div>
            </Card>
          ))
        )}
      </Section>

      <Section title="Coachs liés" count={accepted.length}>
        {accepted.length === 0 ? (
          <Empty>Aucun coach lié pour l&apos;instant.</Empty>
        ) : (
          accepted.map(i => (
            <Card key={i.coach_id} invitation={i}>
              <button
                disabled={busyCoachId === i.coach_id}
                onClick={() => unlink(i.coach_id)}
                className="w-full py-2 bg-gray-800 hover:bg-red-950 disabled:opacity-50 text-gray-300 hover:text-red-300 text-sm font-medium rounded-lg border border-gray-700 hover:border-red-900 transition-colors"
              >
                Se délier de ce coach
              </button>
            </Card>
          ))
        )}
      </Section>

      {rejected.length > 0 && (
        <Section title="Refusées" count={rejected.length}>
          {rejected.map(i => (
            <Card key={i.coach_id} invitation={i}>
              <div className="flex gap-2">
                <button
                  disabled={busyCoachId === i.coach_id}
                  onClick={() => respond(i.coach_id, 'accept')}
                  className="flex-1 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  Accepter finalement
                </button>
                <button
                  disabled={busyCoachId === i.coach_id}
                  onClick={() => unlink(i.coach_id)}
                  className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-400 text-sm font-medium rounded-lg border border-gray-700 transition-colors"
                >
                  Supprimer
                </button>
              </div>
            </Card>
          ))}
        </Section>
      )}
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm uppercase tracking-wider text-gray-400 mb-3">
        {title} <span className="text-gray-600">({count})</span>
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-gray-800 px-4 py-6 text-center text-sm text-gray-500">
      {children}
    </p>
  )
}

function Card({ invitation, children }: { invitation: Invitation; children: React.ReactNode }) {
  const name = invitation.other_party?.full_name || 'Coach inconnu'
  const email = invitation.other_party?.email || ''
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-full bg-orange-800 flex items-center justify-center text-white font-bold text-sm">
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-white truncate">{name}</p>
          <p className="text-xs text-gray-500 truncate">{email}</p>
        </div>
      </div>
      {children}
    </div>
  )
}
