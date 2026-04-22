-- =========================================================================
-- Multi-tenant : Espaces (Organization) regroupant plusieurs Events
--
-- Migration non destructive :
-- 1. Crée les tables Organization, UserOrganization, UserEvent.
-- 2. Ajoute Event.organizationId (nullable pendant la migration).
-- 3. Crée un Espace par défaut "Palais des Festivals".
-- 4. Backfill tous les events existants vers cet Espace.
-- 5. Rattache tous les users actifs à l'Espace par défaut → comportement
--    RBAC strictement identique à l'avant-migration (tout le monde voit
--    encore tout ce qu'il voyait avant).
-- 6. Ajoute la valeur 'GESTION_ESPACES' à l'enum Feature.
--
-- NB : organizationId reste nullable à la fin de cette migration. Une
-- future migration (une fois que toutes les APIs imposent la présence)
-- pourra passer la colonne en NOT NULL.
-- =========================================================================

-- 1. Organization
CREATE TABLE "Organization" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "name"         TEXT NOT NULL,
    "slug"         TEXT NOT NULL,
    "logo"         TEXT,
    "logoData"     BYTEA,
    "logoMimeType" TEXT,
    "color"        TEXT NOT NULL DEFAULT '#4F587E',
    "description"  TEXT,
    "isActive"     BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX "Organization_isActive_idx" ON "Organization"("isActive");

-- 2. UserOrganization
CREATE TABLE "UserOrganization" (
    "userId"         TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserOrganization_pkey" PRIMARY KEY ("userId", "organizationId")
);
CREATE INDEX "UserOrganization_userId_idx"         ON "UserOrganization"("userId");
CREATE INDEX "UserOrganization_organizationId_idx" ON "UserOrganization"("organizationId");
ALTER TABLE "UserOrganization"
    ADD CONSTRAINT "UserOrganization_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserOrganization"
    ADD CONSTRAINT "UserOrganization_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. UserEvent (grant exceptionnel d'un event hors Espaces)
CREATE TABLE "UserEvent" (
    "userId"    TEXT NOT NULL,
    "eventId"   TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserEvent_pkey" PRIMARY KEY ("userId", "eventId")
);
CREATE INDEX "UserEvent_userId_idx"  ON "UserEvent"("userId");
CREATE INDEX "UserEvent_eventId_idx" ON "UserEvent"("eventId");
ALTER TABLE "UserEvent"
    ADD CONSTRAINT "UserEvent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserEvent"
    ADD CONSTRAINT "UserEvent_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Event.organizationId
ALTER TABLE "Event" ADD COLUMN "organizationId" TEXT;
CREATE INDEX "Event_organizationId_idx" ON "Event"("organizationId");
ALTER TABLE "Event"
    ADD CONSTRAINT "Event_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Espace par défaut "Palais des Festivals"
INSERT INTO "Organization" ("id", "name", "slug", "color", "isActive", "createdAt", "updatedAt")
VALUES (
    'palais-des-festivals',
    'Palais des Festivals',
    'palais-des-festivals',
    '#4F587E',
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- 6. Backfill events existants
UPDATE "Event"
SET "organizationId" = 'palais-des-festivals'
WHERE "organizationId" IS NULL;

-- 7. Rattache tous les users actifs à l'Espace par défaut
INSERT INTO "UserOrganization" ("userId", "organizationId", "createdAt")
SELECT u."id", 'palais-des-festivals', CURRENT_TIMESTAMP
FROM "user" u
WHERE u."isActive" = TRUE
ON CONFLICT DO NOTHING;

-- 8. Enum Feature : ajout de GESTION_ESPACES
ALTER TYPE "Feature" ADD VALUE IF NOT EXISTS 'GESTION_ESPACES';
