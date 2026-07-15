-- Ajoute scopeKey canonique aux quotas RxCapacity (ZONE / PORT / SECTOR / SPACE / LOCATION / EVENT).
-- Backfill des lignes existantes : ZONE:<zone> pour conserver le comportement historique.

ALTER TABLE "rx_capacity" ADD COLUMN "scopeKey" TEXT;

UPDATE "rx_capacity"
SET "scopeKey" = 'ZONE:' || "zone"
WHERE "scopeKey" IS NULL;

ALTER TABLE "rx_capacity" ALTER COLUMN "scopeKey" SET NOT NULL;

DROP INDEX IF EXISTS "rx_capacity_organizationId_eventId_zone_date_startTime_endT_key";

CREATE UNIQUE INDEX "rx_capacity_organizationId_eventId_scopeKey_date_startTime_endTime_vehicleFamily_phase_key"
ON "rx_capacity"("organizationId", "eventId", "scopeKey", "date", "startTime", "endTime", "vehicleFamily", "phase");

CREATE INDEX "rx_capacity_organizationId_eventId_scopeKey_date_idx"
ON "rx_capacity"("organizationId", "eventId", "scopeKey", "date");
