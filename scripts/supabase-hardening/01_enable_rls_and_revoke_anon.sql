-- =========================================================================
-- DURCISSEMENT SUPABASE — À EXÉCUTER UNIQUEMENT SUR LA BASE SUPABASE (BACKUP)
--
-- PROJET CIBLÉ : avbioovvnoepogtawtzp.supabase.co (backup, pas Neon !)
--
-- OBJECTIF :
--   Supabase expose AUTOMATIQUEMENT toutes les tables du schéma `public`
--   via PostgREST (https://<projet>.supabase.co/rest/v1/<table>) avec une
--   clé `anon` publique. Sans RLS, n'importe qui ayant cette clé peut
--   lire/modifier vos données — y compris account.password, session.token,
--   account.refreshToken, etc.
--
-- CE QUE FAIT CE SCRIPT (en deux couches de défense) :
--   1. Active RLS sur toutes les tables du schéma `public` (sans policy
--      → mode "deny all" pour les rôles anon et authenticated)
--   2. Révoque explicitement TOUS les droits CRUD des rôles anon et
--      authenticated sur ce schéma (ceinture + bretelles)
--
-- POURQUOI ÇA NE CASSE RIEN POUR VOTRE APP :
--   - L'app se connecte à Supabase UNIQUEMENT via les scripts pg.Client
--     (db:sync, full-backup-neon) qui utilisent le user `postgres`
--   - Le user `postgres` est OWNER des tables → bypass naturel de RLS
--     tant qu'on n'utilise PAS `FORCE ROW LEVEL SECURITY` (que ce script
--     N'utilise PAS justement, par sécurité)
--   - L'app de production tape sur Neon (DATABASE_URL), pas sur Supabase
--
-- SAFE À REJOUER : toutes les commandes sont idempotentes.
--
-- ─── COMMENT EXÉCUTER ─────────────────────────────────────────────────
-- 1. Aller sur https://supabase.com/dashboard/project/avbioovvnoepogtawtzp
-- 2. Cliquer sur "SQL Editor" dans la barre de gauche
-- 3. Coller TOUT le contenu de ce fichier
-- 4. Cliquer "Run" (Ctrl+Enter)
-- 5. Lancer `npm run db:sync:verify` en local pour vérifier que le backup
--    fonctionne toujours
-- ─────────────────────────────────────────────────────────────────────
-- =========================================================================

-- ─── 1. Activation RLS sur toutes les tables `public` ────────────────────
-- Sans policy associée → toutes les requêtes via PostgREST en `anon` ou
-- `authenticated` retournent 0 ligne (sécurité par défaut).
-- Le rôle `postgres` (owner) continue à pouvoir tout faire.
-- =========================================================================

DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT tablename
        FROM   pg_tables
        WHERE  schemaname = 'public'
    LOOP
        EXECUTE format(
            'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
            r.tablename
        );
        RAISE NOTICE 'RLS enabled on public.%', r.tablename;
    END LOOP;
END $$;

-- ─── 2. Révocation explicite des droits anon / authenticated ─────────────
-- Double barrière : même si quelqu'un crée par erreur une policy "FOR ALL
-- USING (true)" plus tard, les rôles anon/authenticated n'auront pas
-- les privilèges SQL nécessaires pour exécuter la requête.
-- =========================================================================

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- Empêche aussi les nouveaux objets créés par `postgres` d'hériter de
-- droits pour anon/authenticated (sinon une future migration pourrait
-- ré-exposer les tables silencieusement).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- L'USAGE sur le schéma reste autorisé (sinon ça pourrait casser des
-- comportements internes Supabase). Le verrou est au niveau des tables.

-- ─── 3. Vérification finale ──────────────────────────────────────────────
-- Cette requête doit retourner 0 ligne après exécution.
-- Si elle retourne des lignes → des tables sont encore exposées.
-- =========================================================================

SELECT
    schemaname,
    tablename,
    rowsecurity AS rls_enabled
FROM   pg_tables
WHERE  schemaname = 'public'
  AND  rowsecurity = false;

-- Cette requête doit retourner uniquement le rôle `postgres` (et
-- éventuellement `service_role`, `supabase_admin`) — JAMAIS `anon`
-- ou `authenticated`.
-- =========================================================================

SELECT
    grantee,
    table_schema,
    table_name,
    privilege_type
FROM   information_schema.role_table_grants
WHERE  table_schema = 'public'
  AND  grantee IN ('anon', 'authenticated')
ORDER BY table_name, privilege_type;
