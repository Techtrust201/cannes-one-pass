-- RX : planning LOCATION, métadonnées règle, dérogation, rôles véhicule, process LIGHT/HEAVY.

-- Enums
ALTER TYPE "ActorSource" ADD VALUE IF NOT EXISTS 'DEROGATION';
ALTER TYPE "LogisticsPlanningScope" ADD VALUE IF NOT EXISTS 'LOCATION';
ALTER TYPE "ImportProfile" ADD VALUE IF NOT EXISTS 'ACCESS_RULES';

DO $$ BEGIN
  CREATE TYPE "VehicleLogisticsRole" AS ENUM ('MONTAGE', 'DEMONTAGE', 'BOTH');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- LogisticsPlanning : emplacement + métadonnées
ALTER TABLE "LogisticsPlanning" ADD COLUMN IF NOT EXISTS "exhibitorLocationId" TEXT;
ALTER TABLE "LogisticsPlanning" ADD COLUMN IF NOT EXISTS "zoneCode" TEXT;
ALTER TABLE "LogisticsPlanning" ADD COLUMN IF NOT EXISTS "allowedVehicleTypeCodes" JSONB;
ALTER TABLE "LogisticsPlanning" ADD COLUMN IF NOT EXISTS "comment" TEXT;

CREATE INDEX IF NOT EXISTS "LogisticsPlanning_exhibitorLocationId_idx"
  ON "LogisticsPlanning"("exhibitorLocationId");

DO $$ BEGIN
  ALTER TABLE "LogisticsPlanning"
    ADD CONSTRAINT "LogisticsPlanning_exhibitorLocationId_fkey"
    FOREIGN KEY ("exhibitorLocationId") REFERENCES "ExhibitorLocation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Vehicle : rôle logistique + société intervenante
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "logisticsRole" "VehicleLogisticsRole" NOT NULL DEFAULT 'BOTH';
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "interveningCompany" TEXT;

CREATE INDEX IF NOT EXISTS "Vehicle_accreditationId_logisticsRole_idx"
  ON "Vehicle"("accreditationId", "logisticsRole");

-- Accreditation : dérogation
ALTER TABLE "Accreditation" ADD COLUMN IF NOT EXISTS "isDerogation" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Accreditation" ADD COLUMN IF NOT EXISTS "derogationReason" TEXT;
ALTER TABLE "Accreditation" ADD COLUMN IF NOT EXISTS "derogationByUserId" TEXT;
ALTER TABLE "Accreditation" ADD COLUMN IF NOT EXISTS "capacityBypass" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Accreditation" ADD COLUMN IF NOT EXISTS "planningBypass" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Accreditation_isDerogation_idx" ON "Accreditation"("isDerogation");
CREATE INDEX IF NOT EXISTS "Accreditation_derogationByUserId_idx" ON "Accreditation"("derogationByUserId");

DO $$ BEGIN
  ALTER TABLE "Accreditation"
    ADD CONSTRAINT "Accreditation_derogationByUserId_fkey"
    FOREIGN KEY ("derogationByUserId") REFERENCES "user"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Processus véhicules LIGHT/HEAVY
CREATE TABLE IF NOT EXISTS "rx_vehicle_process_config" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "vehicleFamily" "VehicleFamily" NOT NULL,
  "zoneCode" TEXT,
  "maxParkingMinutes" INTEGER,
  "requiresReceiver" BOOLEAN NOT NULL DEFAULT false,
  "requiresHeavyUnloadingDetails" BOOLEAN NOT NULL DEFAULT false,
  "title" TEXT NOT NULL,
  "instructions" JSONB NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rx_vehicle_process_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "rx_vehicle_process_config_organizationId_vehicleFamily_key"
  ON "rx_vehicle_process_config"("organizationId", "vehicleFamily");

CREATE INDEX IF NOT EXISTS "rx_vehicle_process_config_organizationId_isActive_idx"
  ON "rx_vehicle_process_config"("organizationId", "isActive");

DO $$ BEGIN
  ALTER TABLE "rx_vehicle_process_config"
    ADD CONSTRAINT "rx_vehicle_process_config_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
