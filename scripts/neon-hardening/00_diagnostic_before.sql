-- =========================================================================
-- DIAGNOSTIC NEON — À EXÉCUTER AVANT TOUTE ACTION (100 % READ-ONLY)
--
-- PROJET CIBLÉ : Neon — branche `production`
-- URL : console.neon.tech → projet "palais des festivals" → SQL Editor
--
-- Ce script ne modifie RIEN. Il liste l'état actuel pour :
--   1. Confirmer que le user Prisma est bien owner (et donc autorisé partout)
--   2. Lister les FK sans index (alerte perf, identique à Supabase Advisor)
--   3. Détecter toute extension potentiellement dangereuse (pg_graphql,
--      pgrest, etc.) qui exposerait les tables au-delà de Prisma
--   4. Détecter d'autres rôles inattendus qui auraient des droits sur
--      le schéma public
--
-- ─── COMMENT EXÉCUTER ─────────────────────────────────────────────────
-- 1. https://console.neon.tech/ → projet → branche `production` → SQL Editor
-- 2. Coller TOUT ce fichier dans l'éditeur
-- 3. Run (Ctrl+Enter)
-- 4. Capturer les résultats (screenshot ou CSV) avant tout durcissement
-- ─────────────────────────────────────────────────────────────────────
-- =========================================================================

-- 1. Quel user es-tu actuellement, et a-t-il les droits attendus ?
SELECT
    '1. Identite session' AS section,
    current_user           AS connected_as,
    current_database()     AS database,
    current_schema()       AS schema,
    version()              AS pg_version;

-- 2. Liste tous les rôles existants avec leurs attributs.
--    On s'attend à voir uniquement `palais_des_festivals_owner`
--    (et les rôles système Neon : `neon_superuser`, `cloud_admin`, etc.)
--    Tout rôle inattendu, surtout avec `rolcanlogin = true`, est suspect.
SELECT
    '2. Roles' AS section,
    rolname,
    rolsuper       AS is_super,
    rolcanlogin    AS can_login,
    rolbypassrls   AS bypass_rls,
    rolconnlimit   AS conn_limit
FROM   pg_roles
WHERE  rolname NOT LIKE 'pg_%'  -- exclut les rôles système Postgres
ORDER  BY rolname;

-- 3. Qui est owner de chaque table du schéma public ?
--    Doit être uniformément `palais_des_festivals_owner`
SELECT
    '3. Owners des tables' AS section,
    schemaname,
    tablename,
    tableowner
FROM   pg_tables
WHERE  schemaname = 'public'
ORDER  BY tableowner, tablename;

-- 4. Quelles permissions ont les autres rôles sur les tables `public` ?
--    Si vous voyez `PUBLIC` ou des rôles inattendus → alerte
SELECT
    '4. Droits sur les tables' AS section,
    grantee,
    table_name,
    string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM   information_schema.role_table_grants
WHERE  table_schema = 'public'
  AND  grantee NOT IN ('palais_des_festivals_owner', 'cloud_admin', 'neon_superuser')
GROUP  BY grantee, table_name
ORDER  BY table_name, grantee;

-- 5. Extensions installées
--    Attention si vous voyez `pg_graphql`, `pgrest`, ou autre extension
--    qui exposerait l'API HTTP — pas censé être actif sur Neon par
--    défaut, mais à vérifier.
SELECT
    '5. Extensions' AS section,
    extname        AS extension,
    extversion     AS version
FROM   pg_extension
ORDER  BY extname;

-- 6. État RLS sur les tables du schéma public
--    Sur Neon ce n'est pas critique (pas de PostgREST), mais utile
--    pour savoir si une migration future l'a activé par mégarde.
SELECT
    '6. RLS status' AS section,
    schemaname,
    tablename,
    rowsecurity    AS rls_enabled,
    forcerowsecurity AS rls_forced
FROM   pg_tables
WHERE  schemaname = 'public'
ORDER  BY tablename;

-- 7. Foreign keys SANS index sur la colonne référençante
--    Source de seq scans lors des DELETE/UPDATE cascade et des joins.
SELECT
    '7. FK sans index' AS section,
    c.conrelid::regclass    AS table_name,
    a.attname               AS column_name,
    c.conname               AS fk_name,
    pg_get_constraintdef(c.oid) AS fk_definition
FROM   pg_constraint c
JOIN   pg_attribute  a
       ON a.attnum    = ANY(c.conkey)
      AND a.attrelid  = c.conrelid
WHERE  c.contype = 'f'
  AND  c.connamespace = 'public'::regnamespace
  AND  NOT EXISTS (
       SELECT 1
       FROM   pg_index i
       WHERE  i.indrelid = c.conrelid
         AND  a.attnum   = ANY(i.indkey)
         AND  i.indkey[0] = a.attnum
  )
ORDER  BY table_name, column_name;

-- 8. État de la dernière migration Prisma appliquée
--    (utile pour confirmer que `vercel-build` a bien tourné après votre push)
SELECT
    '8. Dernieres migrations Prisma' AS section,
    migration_name,
    started_at,
    finished_at,
    rolled_back_at,
    applied_steps_count
FROM   "_prisma_migrations"
ORDER  BY started_at DESC
LIMIT  5;

-- 9. Connexions actives (pour vérifier qui tape sur la prod)
SELECT
    '9. Connexions actives' AS section,
    usename,
    application_name,
    client_addr,
    state,
    count(*) AS nb_connexions
FROM   pg_stat_activity
WHERE  datname = current_database()
  AND  pid <> pg_backend_pid()
GROUP  BY usename, application_name, client_addr, state
ORDER  BY nb_connexions DESC;
