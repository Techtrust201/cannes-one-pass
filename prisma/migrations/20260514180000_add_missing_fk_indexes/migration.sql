-- =========================================================================
-- Ajout des index manquants sur les foreign keys
--
-- Pourquoi ?
--   Supabase Advisor (et tout DBA Postgres sérieux) signale qu'une foreign
--   key sans index sur la colonne référençante provoque des seq scans lors :
--     - des DELETE / UPDATE du parent (CASCADE)
--     - des JOINs entre parent et enfant
--     - des lookups "tous les enfants de X"
--
-- Migration NON destructive et IDEMPOTENTE :
--   - "CREATE INDEX IF NOT EXISTS" → rejouable sans erreur
--   - aucune donnée modifiée
--   - les noms d'index suivent la convention Prisma : <Table>_<col>_idx
--
-- Tables concernées :
--   - account                    (Better Auth) → userId
--   - session                    (Better Auth) → userId
--   - Vehicle                    → accreditationId
--   - ZoneMovement               → accreditationId
--   - AccreditationEmailHistory  → accreditationId
--   - ChatMessage                → userId  (composé accreditationId+createdAt existe déjà)
--
-- Impact : aucun risque de blocage applicatif (les tables ont des volumes
-- modérés, la création est quasi-instantanée). Si vous voulez du zéro-lock
-- absolu sur une grosse table, remplacez "CREATE INDEX" par
-- "CREATE INDEX CONCURRENTLY" et exécutez manuellement hors migration
-- Prisma (CONCURRENTLY ne supporte pas les transactions).
-- =========================================================================

CREATE INDEX IF NOT EXISTS "account_userId_idx"
    ON "account" ("userId");

CREATE INDEX IF NOT EXISTS "session_userId_idx"
    ON "session" ("userId");

CREATE INDEX IF NOT EXISTS "Vehicle_accreditationId_idx"
    ON "Vehicle" ("accreditationId");

CREATE INDEX IF NOT EXISTS "ZoneMovement_accreditationId_idx"
    ON "ZoneMovement" ("accreditationId");

CREATE INDEX IF NOT EXISTS "AccreditationEmailHistory_accreditationId_idx"
    ON "AccreditationEmailHistory" ("accreditationId");

CREATE INDEX IF NOT EXISTS "ChatMessage_userId_idx"
    ON "ChatMessage" ("userId");
