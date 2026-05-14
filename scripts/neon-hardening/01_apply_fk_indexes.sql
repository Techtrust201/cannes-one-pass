-- =========================================================================
-- INDEX MANQUANTS SUR LES FOREIGN KEYS — NEON STANDALONE
--
-- Ce fichier est STRICTEMENT IDENTIQUE à la migration Prisma :
--   prisma/migrations/20260514180000_add_missing_fk_indexes/migration.sql
--
-- POURQUOI UN FICHIER STANDALONE ?
--   - La migration Prisma sera appliquée AUTOMATIQUEMENT au prochain
--     déploiement Vercel (le script vercel-build lance `prisma migrate
--     deploy` sur la base pointée par DATABASE_URL = Neon prod).
--   - Si vous voulez appliquer les index TOUT DE SUITE sans attendre
--     un redéploiement, exécutez ce fichier dans le SQL Editor Neon.
--   - Idempotent grâce à `IF NOT EXISTS` → safe à rejouer même après
--     que vercel-build l'ait déjà fait.
--
-- ⚠️  ATTENTION : si vous l'exécutez ici AVANT que `prisma migrate
--     deploy` ne tourne, la migration Prisma sera quand même appliquée
--     plus tard mais ses CREATE INDEX feront un no-op (grâce à IF NOT
--     EXISTS). C'est parfaitement safe.
--
-- ─── COMMENT EXÉCUTER ─────────────────────────────────────────────────
-- 1. console.neon.tech → projet → branche `production` → SQL Editor
-- 2. Coller TOUT ce fichier
-- 3. Run (Ctrl+Enter)
-- 4. Vérifier les SELECT de validation en bas du fichier
-- ─────────────────────────────────────────────────────────────────────
-- =========================================================================

-- Better Auth — account.userId
CREATE INDEX IF NOT EXISTS "account_userId_idx"
    ON "account" ("userId");

-- Better Auth — session.userId
CREATE INDEX IF NOT EXISTS "session_userId_idx"
    ON "session" ("userId");

-- Métier — Vehicle.accreditationId
CREATE INDEX IF NOT EXISTS "Vehicle_accreditationId_idx"
    ON "Vehicle" ("accreditationId");

-- Métier — ZoneMovement.accreditationId
CREATE INDEX IF NOT EXISTS "ZoneMovement_accreditationId_idx"
    ON "ZoneMovement" ("accreditationId");

-- Métier — AccreditationEmailHistory.accreditationId
CREATE INDEX IF NOT EXISTS "AccreditationEmailHistory_accreditationId_idx"
    ON "AccreditationEmailHistory" ("accreditationId");

-- Métier — ChatMessage.userId
-- (l'index composé [accreditationId, createdAt] existe déjà,
--  mais il ne couvre pas les lookups par userId seul)
CREATE INDEX IF NOT EXISTS "ChatMessage_userId_idx"
    ON "ChatMessage" ("userId");

-- ─── Validation immédiate ────────────────────────────────────────────
-- Les 6 index ci-dessous doivent tous apparaître dans le résultat.
-- =========================================================================

SELECT
    'Verif: index crees' AS section,
    schemaname,
    tablename,
    indexname,
    indexdef
FROM   pg_indexes
WHERE  schemaname = 'public'
  AND  indexname IN (
       'account_userId_idx',
       'session_userId_idx',
       'Vehicle_accreditationId_idx',
       'ZoneMovement_accreditationId_idx',
       'AccreditationEmailHistory_accreditationId_idx',
       'ChatMessage_userId_idx'
  )
ORDER  BY tablename;
