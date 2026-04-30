'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AjouterAthleteClient() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const router = useRouter()

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    const res = await fetch('/api/athletes/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })

    const data = await res.json()
    if (res.ok) {
      setMessage({ text: 'Invitation envoyée. L\'athlète doit l\'accepter pour activer l\'accès.', ok: true })
      setEmail('')
      router.refresh()
    } else {
      setMessage({ text: data.error ?? 'Erreur', ok: false })
    }
    setLoading(false)
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 max-w-md">
      <h2 className="text-white font-semibold mb-4">Inviter un athlète</h2>
      <form onSubmit={handleAdd} className="space-y-3">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          placeholder="email@athlète.com"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        {message && (
          <p className={`text-sm ${message.ok ? 'text-green-400' : 'text-red-400'}`}>
            {message.text}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors"
        >
          {loading ? 'Envoi...' : 'Envoyer l\'invitation'}
        </button>
      </form>
      <p className="text-gray-500 text-xs mt-3">
        L&apos;athlète doit avoir un compte. Tant qu&apos;il n&apos;a pas accepté, vous ne voyez pas ses données.
      </p>
    </div>
  )
}
