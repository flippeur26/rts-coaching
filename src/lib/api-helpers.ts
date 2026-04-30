import { NextResponse } from 'next/server'

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status })
}

export function err(message: string, code: string, status: number) {
  return NextResponse.json({ error: message, code }, { status })
}

export const ERRORS = {
  UNAUTHORIZED: () => err('Non authentifié', 'UNAUTHORIZED', 401),
  FORBIDDEN: () => err('Accès refusé', 'FORBIDDEN', 403),
  NOT_FOUND: (res: string) => err(`${res} introuvable`, 'NOT_FOUND', 404),
  INVALID: (msg: string) => err(msg, 'VALIDATION_ERROR', 422),
  SERVER: () => err('Erreur serveur', 'INTERNAL_ERROR', 500),
}
