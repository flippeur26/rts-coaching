# Setup RTS Coaching

## 1. Créer le projet Supabase

1. Aller sur [supabase.com](https://supabase.com) → New project
2. Noter l'URL et les clés API (Settings → API)

## 2. Variables d'environnement

Copier `.env.local.example` en `.env.local` et remplir :

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## 3. Migrations SQL (dans Supabase SQL Editor)

Exécuter dans l'ordre :

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_lookup_tables.sql`
3. `supabase/migrations/003_stress_functions.sql`
4. `supabase/seed/001_lookup_e1rm.sql`
5. `supabase/seed/002_lookup_stress.sql`

## 4. Créer les premiers utilisateurs

Dans Supabase → Authentication → Users → Invite user

Le trigger `on_auth_user_created` crée automatiquement le profil.
Pour définir le rôle `coach`, passer `{ "role": "coach" }` dans les user metadata.

Ou via SQL après création :
```sql
UPDATE profiles SET role = 'coach' WHERE email = 'coach@exemple.com';
```

## 5. Lancer en développement

```bash
npm run dev
```

L'app sera disponible sur http://localhost:3000
