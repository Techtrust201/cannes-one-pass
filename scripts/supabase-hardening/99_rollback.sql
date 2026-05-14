-- =========================================================================
-- ROLLBACK — À EXÉCUTER UNIQUEMENT SI VOUS DEVEZ ANNULER LE DURCISSEMENT
--
-- À utiliser SEULEMENT si :
--   - Vous découvrez qu'un service Supabase légitime (Edge Function,
--     Storage, etc.) avait besoin de l'accès anon/authenticated
--   - Un script de votre côté utilisait la clé `anon` (improbable d'après
--     l'audit, aucun import de @supabase/supabase-js dans le code)
--
-- Ce script REND votre base Supabase à son état "exposée par défaut".
-- Ne l'utilisez QUE pour debug, puis RE-EXÉCUTEZ le 01_enable_rls...sql !
-- =========================================================================

-- 1. Désactiver RLS partout
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
            'ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY',
            r.tablename
        );
    END LOOP;
END $$;

-- 2. Re-grant des droits à anon/authenticated (revient à l'état Supabase
--    par défaut, où le schéma public est exposé via PostgREST)
GRANT USAGE                      ON SCHEMA public               TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT, UPDATE         ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE                       ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT, UPDATE          ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT EXECUTE                        ON FUNCTIONS TO anon, authenticated;
