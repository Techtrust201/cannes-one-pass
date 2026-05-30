-- AlterTable
ALTER TABLE "Accreditation" ADD COLUMN     "standId" TEXT;

-- CreateTable
CREATE TABLE "Stand" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT,
    "number" TEXT NOT NULL,
    "sector" TEXT,
    "zone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Stand_organizationId_idx" ON "Stand"("organizationId");

-- CreateIndex
CREATE INDEX "Stand_eventId_idx" ON "Stand"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Stand_organizationId_eventId_number_key" ON "Stand"("organizationId", "eventId", "number");

-- CreateIndex
CREATE INDEX "Accreditation_standId_idx" ON "Accreditation"("standId");

-- AddForeignKey
ALTER TABLE "Stand" ADD CONSTRAINT "Stand_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stand" ADD CONSTRAINT "Stand_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accreditation" ADD CONSTRAINT "Accreditation_standId_fkey" FOREIGN KEY ("standId") REFERENCES "Stand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill : crée un Stand par (organizationId, eventId, stand) distinct et relie les accréditations.
INSERT INTO "Stand" ("id", "organizationId", "eventId", "number", "createdAt", "updatedAt")
SELECT gen_random_uuid(), a."organizationId", a."eventId", a."stand", NOW(), NOW()
FROM (
  SELECT DISTINCT "organizationId", "eventId", "stand"
  FROM "Accreditation"
  WHERE "organizationId" IS NOT NULL AND "stand" IS NOT NULL AND "stand" <> ''
) a
ON CONFLICT ("organizationId", "eventId", "number") DO NOTHING;

UPDATE "Accreditation" a
SET "standId" = s."id"
FROM "Stand" s
WHERE a."organizationId" = s."organizationId"
  AND a."stand" = s."number"
  AND (a."eventId" = s."eventId" OR (a."eventId" IS NULL AND s."eventId" IS NULL))
  AND a."standId" IS NULL;
