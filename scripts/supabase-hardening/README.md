# Durcissement sécurité Supabase + Index FK manquants

Ce dossier contient les scripts pour répondre aux alertes Supabase Advisor
(RLS Disabled, Sensitive Columns Exposed, Unindexed foreign keys).

## TL;DR — Ordre d'exécution

| # | Fichier | Où | Quand | Risque |
|---|---|---|---|---|
| 1 | `00_diagnostic_before.sql` | Supabase SQL Editor | Avant tout | ☆ Zéro (read-only) |
| 2 | `01_enable_rls_and_revoke_anon.sql` | Supabase SQL Editor | Après diagnostic | ☆ Très faible |
| 3 | Migration Prisma `20260514180000_add_missing_fk_indexes` | Auto au prochain déploiement Vercel | Au prochain push | ☆ Très faible |
| 4 | `99_rollback.sql` | Supabase SQL Editor | UNIQUEMENT si problème | — |

---

## Contexte

L'app utilise Prisma pour se connecter à PostgreSQL :

- **Base primaire** = Neon (toutes les requêtes runtime de l'app)
- **Base backup** = Supabase (mise à jour par `npm run db:sync` / `npm run db:backup`)

Supabase expose **automatiquement** les tables du schéma `public` via PostgREST
(`https://<projet>.supabase.co/rest/v1/...`) avec une clé `anon` publique.
Sans RLS, **n'importe qui** ayant cette clé peut lire/écrire vos tables —
**y compris `account.password`, `session.token`, `account.refreshToken`**.

Comme l'app n'utilise jamais le client Supabase JS (vérifié par grep, aucun
`@supabase/supabase-js` dans `package.json`), on peut couper cette exposition
sans aucun impact fonctionnel.

---

## Étape 1 — Diagnostic préalable (1 min, read-only)

Exécuter `00_diagnostic_before.sql` dans le SQL Editor Supabase.

Vous devriez voir :

1. **Section 1** : ~17 tables avec `rls_enabled = false`
2. **Section 2** : `anon` et `authenticated` ont des droits CRUD sur la
   plupart des tables → confirme le risque
3. **Section 3** : `tableowner = postgres` partout (important pour la suite)
4. **Section 4** : la liste des FK sans index (cohérente avec les alertes)

**Sauvegardez ces résultats** (screenshot ou export CSV) pour comparaison
post-hardening.

---

## Étape 2 — Durcissement Supabase (2 min)

### Pourquoi c'est safe pour votre app

| Vecteur d'accès à Supabase | Impact du durcissement |
|---|---|
| PostgREST (`/rest/v1/...`) avec clé `anon` | ✅ Bloqué (intentionnel) |
| Scripts `db:sync` / `db:backup` (`pg.Client` avec user `postgres`) | ✅ Inchangé (owner bypass RLS sans `FORCE`) |
| Connexion Prisma de l'app | ⚪ Non concerné (Prisma → Neon, pas Supabase) |
| Dashboard Supabase | ✅ Inchangé (utilise `service_role`) |

### Comment exécuter

1. Aller sur https://supabase.com/dashboard/project/avbioovvnoepogtawtzp/sql
2. Coller **tout** le contenu de `01_enable_rls_and_revoke_anon.sql`
3. Cliquer **Run** (Ctrl+Enter)
4. Vérifier que les deux SELECT finaux retournent **0 ligne**

### Validation que rien n'est cassé

```bash
# Doit toujours fonctionner (compte les rangs des deux côtés)
npm run db:sync:verify
```

Si la commande affiche les counts sans erreur de connexion → c'est bon.

---

## Étape 3 — Index manquants (déploiement standard)

Les modifications sont déjà dans le code :

- `prisma/schema.prisma` → ajout des `@@index` manquants
- `prisma/migrations/20260514180000_add_missing_fk_indexes/migration.sql`
  → SQL idempotent avec `CREATE INDEX IF NOT EXISTS`

**Ces index seront créés automatiquement** :

- En local : `npx prisma migrate dev` (si vous travaillez en local)
- En prod : au prochain `vercel-build` (qui lance `prisma migrate deploy`)
- Sur Supabase (backup) : sera créé par `prisma migrate deploy` aussi, OU
  vous pouvez l'exécuter à la main dans le SQL Editor Supabase en collant
  le contenu de la migration

### Performance

- Les tables concernées (Vehicle, ZoneMovement, ChatMessage, etc.) ont des
  volumes modérés → création d'index quasi-instantanée
- `IF NOT EXISTS` rend la migration rejouable sans erreur

Pour un zéro-lock absolu sur très gros volumes, remplacer `CREATE INDEX`
par `CREATE INDEX CONCURRENTLY` et l'exécuter **hors** migration Prisma
(CONCURRENTLY ne supporte pas les transactions).

---

## Étape 4 — En cas de problème (rollback)

Si après le durcissement quelque chose semble cassé :

1. **NE PAS PANIQUER** — l'app prod tape sur Neon, donc rien de fonctionnel
   ne devrait être affecté
2. Vérifier les logs Vercel et les messages d'erreur
3. Si vraiment besoin de rollback : exécuter `99_rollback.sql` dans le
   SQL Editor Supabase
4. **MAIS** : ne laissez jamais Supabase en état "rollbacké" en production
   → identifiez ce qui ne passait pas, corrigez, puis ré-exécutez le
   `01_...sql`

---

## Et après ?

Une fois ces étapes terminées, retourner sur le **Supabase Advisor** :

- Les 17 alertes "RLS Disabled in Public" → ✅ résolues
- Les 2 alertes "Sensitive Columns Exposed" → ✅ résolues (RLS bloque)
- Les 6 alertes "Unindexed foreign keys" → ✅ résolues (au prochain deploy)
- L'alerte "Unused Index" sur `public.Event` → ⚠️  À ignorer : Supabase
  mesure ça sur la base de backup peu utilisée. Vérifier sur Neon avant
  de supprimer l'index :

```sql
SELECT indexrelname, idx_scan, idx_tup_read
FROM   pg_stat_user_indexes
WHERE  relname = 'Event'
ORDER  BY idx_scan ASC;
```

## Et la rotation des secrets ?

Indépendamment de ce hardening, je vous recommande aussi de :

- Régénérer `BETTER_AUTH_SECRET` (invalidera toutes les sessions Better Auth,
  les users devront se reconnecter — pas grave)
- Régénérer la clé Resend
- Régénérer les clés `anon` / `service_role` Supabase
  (Dashboard → API Settings → "Reset")
- Roter le mot de passe Postgres Supabase (Dashboard → Database → Settings)

Ce n'est pas dans ce dossier car ce sont des actions manuelles dans les
dashboards externes.
