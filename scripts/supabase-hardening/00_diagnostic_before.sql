-- =========================================================================
-- DIAGNOSTIC PRÉALABLE — À EXÉCUTER AVANT TOUT DURCISSEMENT
--
-- Ce script est 100 % READ-ONLY. Il ne modifie rien.
-- Il vous permet de constater l'état actuel et de comparer avec l'état
-- post-durcissement.
--
-- ─── COMMENT EXÉCUTER ─────────────────────────────────────────────────
-- 1. Supabase Dashboard → SQL Editor
-- 2. Coller ce fichier et "Run"
-- 3. Capturer les résultats (screenshot ou export CSV)
-- ─────────────────────────────────────────────────────────────────────
-- =========================================================================

-- 1. Quelles tables ont RLS désactivé ?
SELECT
    '1. Tables sans RLS' AS section,
    schemaname,
    tablename,
    rowsecurity AS rls_enabled
FROM   pg_tables
WHERE  schemaname = 'public'
ORDER  BY rowsecurity, tablename;

-- 2. Quels droits ont `anon` et `authenticated` sur les tables ?
SELECT
    '2. Droits anon/authenticated' AS section,
    grantee,
    table_name,
    string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM   information_schema.role_table_grants
WHERE  table_schema = 'public'
  AND  grantee IN ('anon', 'authenticated')
GROUP  BY grantee, table_name
ORDER  BY table_name, grantee;

-- 3. Le rôle `postgres` est-il bien owner des tables ? (sinon RLS le bloquerait)
SELECT
    '3. Owners des tables' AS section,
    schemaname,
    tablename,
    tableowner
FROM   pg_tables
WHERE  schemaname = 'public'
ORDER  BY tableowner, tablename;

-- 4. Index manquants sur les foreign keys (alerte Supabase Advisor)
SELECT
    '4. FK sans index' AS section,
    c.conrelid::regclass    AS table_name,
    a.attname               AS column_name,
    c.conname               AS fk_name
FROM   pg_constraint c
JOIN   pg_attribute  a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
WHERE  c.contype = 'f'
  AND  c.connamespace = 'public'::regnamespace
  AND  NOT EXISTS (
       SELECT 1
       FROM   pg_index i
       WHERE  i.indrelid = c.conrelid
         AND  a.attnum   = ANY(i.indkey)
         AND  i.indkey[0] = a.attnum  -- l'index doit commencer par cette colonne
  )
ORDER  BY table_name, column_name;
