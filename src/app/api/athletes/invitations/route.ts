import { NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { z } from 'zod'

const inviteSchema = z.object({ email: z.string().email() })

// POST /api/athletes/invitations  — coach invite un athlète par email
// Crée une relation status='pending'. L'athlète doit accepter pour activer l'accès.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'coach') return ERRORS.FORBIDDEN()

  const body = await request.json()
  const parsed = inviteSchema.safeParse(body)
  if (!parsed.success) return ERRORS.INVALID('Email invalide')

  // Lecture admin du profil cible (RLS bloque la lecture cross-profil pour le coach)
  const admin = createAdminClient()
  const { data: athlete } = await admin
    .from('profiles')
    .select('id, role')
    .eq('email', parsed.data.email)
    .single()

  if (!athlete) return ERRORS.NOT_FOUND('Aucun utilisateur avec cet email')
  if (athlete.role !== 'athlete') return ERRORS.INVALID('Cet utilisateur n\'est pas un athlète')
  if (athlete.id === user.id) return ERRORS.INVALID('Vous ne pouvez pas vous ajouter vous-même')

  // Déjà une relation ?
  const { data: existing } = await supabase
    .from('coach_athlete')
    .select('status')
    .eq('coach_id', user.id)
    .eq('athlete_id', athlete.id)
    .single()

  if (existing) {
    if (existing.status === 'pending')  return ERRORS.INVALID('Invitation déjà envoyée, en attente d\'acceptation')
    if (existing.status === 'accepted') return ERRORS.INVALID('Cet athlète est déjà lié à votre compte')
    // 'rejected' → on supprime puis on recrée pour repartir en 'pending'
    if (existing.status === 'rejected') {
      const { error: delErr } = await supabase
        .from('coach_athlete')
        .delete()
        .eq('coach_id', user.id)
        .eq('athlete_id', athlete.id)
      if (delErr) return ERRORS.SERVER()
    }
  }

  const { error } = await supabase
    .from('coach_athlete')
    .insert({ coach_id: user.id, athlete_id: athlete.id, status: 'pending' })

  if (error) return ERRORS.SERVER()
  return ok({ invited: true }, 201)
}

type InvitationRow = {
  coach_id: string
  athlete_id: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
  accepted_at: string | null
  rejected_at: string | null
}

// GET /api/athletes/invitations  — liste des invitations (caller-aware)
// - coach   : invitations sortantes (toutes les relations qu'il a créées)
// - athlète : invitations entrantes (toutes les relations le concernant)
// La réponse joint le profil de l'autre partie via le service_role
// (les RLS bloquent la lecture cross-profil tant que la relation est non-acceptée).
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile) return ERRORS.UNAUTHORIZED()

  const isCoach = profile.role === 'coach'
  const filterCol = isCoach ? 'coach_id' : 'athlete_id'

  const { data: rels, error } = await supabase
    .from('coach_athlete')
    .select('coach_id, athlete_id, status, created_at, accepted_at, rejected_at')
    .eq(filterCol, user.id)
    .order('created_at', { ascending: false })

  if (error) return ERRORS.SERVER()

  const otherIds = (rels ?? []).map(r =>
    isCoach ? (r as InvitationRow).athlete_id : (r as InvitationRow).coach_id
  )

  const admin = createAdminClient()
  const { data: profiles } = otherIds.length
    ? await admin.from('profiles').select('id, full_name, email').in('id', otherIds)
    : { data: [] as { id: string; full_name: string; email: string }[] }

  const byId = new Map((profiles ?? []).map(p => [p.id, p]))

  const enriched = (rels ?? []).map(r => {
    const row = r as InvitationRow
    const otherId = isCoach ? row.athlete_id : row.coach_id
    return { ...row, other_party: byId.get(otherId) ?? null }
  })

  return ok(enriched)
}
