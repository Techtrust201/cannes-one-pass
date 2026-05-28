-- =========================================================================
-- Multi-organisations : extension du modèle de données
--
-- Migration non destructive et IDEMPOTENTE (rejouable en toute sécurité,
-- même après application partielle — Neon pooler ne wrap pas les
-- migrations dans une transaction atomique).
--
-- 1. Étend Organization : formTemplate, accreditationCodePrefix, supportEmail.
-- 2. Ajoute Accreditation.organizationId (FK + index) + extension Json + publicCode.
-- 3. Rend Vehicle.plate nullable + ajoute Vehicle.assignedAt (workflow scan RX).
-- 4. Ajoute organizationId nullable à ZoneConfig / VehicleTypeConfig /
--    UnloadingProvider et remplace les @unique globaux par des composites.
-- 5. Crée la table Exhibitor (catalogue par event).
-- 6. Crée les tables SupportTicket + SupportTicketReply (module Tickets).
-- 7. Ajoute la valeur TICKETS à l'enum Feature.
-- 8. Crée l'enum SupportTicketStatus.
-- 9. Backfill : remplit Accreditation.organizationId depuis Event.organizationId.
-- =========================================================================

-- 1. Organization : nouveaux champs
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "formTemplate"            TEXT NOT NULL DEFAULT 'palais';
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "accreditationCodePrefix" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "supportEmail"            TEXT;

-- 2. Accreditation : FK directe Organization + extension JSON + code public
ALTER TABLE "Accreditation" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Accreditation" ADD COLUMN IF NOT EXISTS "extension"      JSONB;
ALTER TABLE "Accreditation" ADD COLUMN IF NOT EXISTS "publicCode"     TEXT;

ALTER TABLE "Accreditation" DROP CONSTRAINT IF EXISTS "Accreditation_organizationId_fkey";
ALTER TABLE "Accreditation"
    ADD CONSTRAINT "Accreditation_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Accreditation_organizationId_idx" ON "Accreditation"("organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "Accreditation_publicCode_key" ON "Accreditation"("publicCode") WHERE "publicCode" IS NOT NULL;

-- 3. Vehicle : plate nullable + assignedAt (DROP NOT NULL est idempotent en PG)
ALTER TABLE "Vehicle" ALTER COLUMN "plate" DROP NOT NULL;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3);

-- 4. ZoneConfig : scoping par organisation
ALTER TABLE "ZoneConfig" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "ZoneConfig" DROP CONSTRAINT IF EXISTS "ZoneConfig_organizationId_fkey";
ALTER TABLE "ZoneConfig"
    ADD CONSTRAINT "ZoneConfig_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ZoneConfig" DROP CONSTRAINT IF EXISTS "ZoneConfig_zone_key";
DROP INDEX IF EXISTS "ZoneConfig_zone_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ZoneConfig_zone_organizationId_key" ON "ZoneConfig"("zone", "organizationId");
CREATE INDEX IF NOT EXISTS "ZoneConfig_organizationId_idx" ON "ZoneConfig"("organizationId");

-- 5. VehicleTypeConfig : scoping par organisation
ALTER TABLE "VehicleTypeConfig" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "VehicleTypeConfig" DROP CONSTRAINT IF EXISTS "VehicleTypeConfig_organizationId_fkey";
ALTER TABLE "VehicleTypeConfig"
    ADD CONSTRAINT "VehicleTypeConfig_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VehicleTypeConfig" DROP CONSTRAINT IF EXISTS "VehicleTypeConfig_code_key";
DROP INDEX IF EXISTS "VehicleTypeConfig_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "VehicleTypeConfig_code_organizationId_key" ON "VehicleTypeConfig"("code", "organizationId");
CREATE INDEX IF NOT EXISTS "VehicleTypeConfig_organizationId_idx" ON "VehicleTypeConfig"("organizationId");

-- 6. UnloadingProvider : scoping par organisation
ALTER TABLE "UnloadingProvider" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "UnloadingProvider" DROP CONSTRAINT IF EXISTS "UnloadingProvider_organizationId_fkey";
ALTER TABLE "UnloadingProvider"
    ADD CONSTRAINT "UnloadingProvider_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UnloadingProvider" DROP CONSTRAINT IF EXISTS "UnloadingProvider_name_key";
DROP INDEX IF EXISTS "UnloadingProvider_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "UnloadingProvider_name_organizationId_key" ON "UnloadingProvider"("name", "organizationId");
CREATE INDEX IF NOT EXISTS "UnloadingProvider_organizationId_idx" ON "UnloadingProvider"("organizationId");

-- 7. Exhibitor : catalogue exposants par event
CREATE TABLE IF NOT EXISTS "Exhibitor" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "eventId"        TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "stand"          TEXT NOT NULL,
    "sector"         TEXT,
    "zone"           TEXT,
    "isActive"       BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "Exhibitor" DROP CONSTRAINT IF EXISTS "Exhibitor_organizationId_fkey";
ALTER TABLE "Exhibitor"
    ADD CONSTRAINT "Exhibitor_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Exhibitor" DROP CONSTRAINT IF EXISTS "Exhibitor_eventId_fkey";
ALTER TABLE "Exhibitor"
    ADD CONSTRAINT "Exhibitor_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Exhibitor_organizationId_idx"      ON "Exhibitor"("organizationId");
CREATE INDEX IF NOT EXISTS "Exhibitor_eventId_idx"             ON "Exhibitor"("eventId");
CREATE INDEX IF NOT EXISTS "Exhibitor_eventId_isActive_idx"    ON "Exhibitor"("eventId", "isActive");

-- 8. Enum SupportTicketStatus (CREATE TYPE ne supporte pas IF NOT EXISTS)
DO $$ BEGIN
    CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'ANSWERED', 'CLOSED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 9. SupportTicket + SupportTicketReply
CREATE TABLE IF NOT EXISTS "SupportTicket" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "eventId"        TEXT,
    "stand"          TEXT NOT NULL,
    "email"          TEXT NOT NULL,
    "phone"          TEXT,
    "message"        TEXT NOT NULL,
    "status"         "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "SupportTicket" DROP CONSTRAINT IF EXISTS "SupportTicket_organizationId_fkey";
ALTER TABLE "SupportTicket"
    ADD CONSTRAINT "SupportTicket_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" DROP CONSTRAINT IF EXISTS "SupportTicket_eventId_fkey";
ALTER TABLE "SupportTicket"
    ADD CONSTRAINT "SupportTicket_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "SupportTicket_organizationId_status_createdAt_idx"
    ON "SupportTicket"("organizationId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "SupportTicket_eventId_idx" ON "SupportTicket"("eventId");

CREATE TABLE IF NOT EXISTS "SupportTicketReply" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "ticketId"     TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body"         TEXT NOT NULL,
    "sentByEmail"  BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "SupportTicketReply" DROP CONSTRAINT IF EXISTS "SupportTicketReply_ticketId_fkey";
ALTER TABLE "SupportTicketReply"
    ADD CONSTRAINT "SupportTicketReply_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportTicketReply" DROP CONSTRAINT IF EXISTS "SupportTicketReply_authorUserId_fkey";
ALTER TABLE "SupportTicketReply"
    ADD CONSTRAINT "SupportTicketReply_authorUserId_fkey"
    FOREIGN KEY ("authorUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "SupportTicketReply_ticketId_createdAt_idx"
    ON "SupportTicketReply"("ticketId", "createdAt");
CREATE INDEX IF NOT EXISTS "SupportTicketReply_authorUserId_idx"
    ON "SupportTicketReply"("authorUserId");

-- 10. Enum Feature : ajouter la valeur TICKETS
ALTER TYPE "Feature" ADD VALUE IF NOT EXISTS 'TICKETS';

-- 11. Backfill Accreditation.organizationId depuis Event.organizationId
--     Idempotent : ne touche que les lignes encore null.
UPDATE "Accreditation" AS a
SET "organizationId" = e."organizationId"
FROM "Event" AS e
WHERE a."eventId" = e."id"
  AND a."organizationId" IS NULL
  AND e."organizationId" IS NOT NULL;
