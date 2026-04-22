-- =========================================================================
-- Audit-log étendu pour AccreditationHistory
-- - Nouveau enum ActorSource
-- - Colonnes actorSource, changeReason, diff sur AccreditationHistory
-- =========================================================================

CREATE TYPE "ActorSource" AS ENUM (
    'PUBLIC_FORM',
    'LOGISTICIEN',
    'CSV_IMPORT',
    'AUTO_DEDUCTION',
    'SUPER_ADMIN',
    'MIGRATION',
    'SYSTEM'
);

ALTER TABLE "AccreditationHistory"
    ADD COLUMN "actorSource" "ActorSource" NOT NULL DEFAULT 'SYSTEM',
    ADD COLUMN "changeReason" TEXT,
    ADD COLUMN "diff" JSONB;

CREATE INDEX "AccreditationHistory_actorSource_idx"
    ON "AccreditationHistory"("actorSource");
