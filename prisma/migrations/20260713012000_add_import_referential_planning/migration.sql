-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('TERRE', 'FLOT', 'STAND');

-- CreateEnum
CREATE TYPE "LogisticsPlanningMode" AS ENUM ('DISABLED', 'TRANSITION', 'STRICT');

-- CreateEnum
CREATE TYPE "LogisticsPlanningScope" AS ENUM ('EVENT', 'PORT', 'SECTOR', 'SPACE');

-- CreateEnum
CREATE TYPE "ImportProfile" AS ENUM ('REFERENTIAL', 'PLANNING', 'ACCREDITATIONS', 'ZONES', 'VEHICLE_TYPES', 'CAPACITIES');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "logisticsPlanningMode" "LogisticsPlanningMode" NOT NULL DEFAULT 'DISABLED';

-- AlterTable
ALTER TABLE "Accreditation" ADD COLUMN     "exhibitorId" TEXT,
ADD COLUMN     "exhibitorLocationId" TEXT,
ADD COLUMN     "locationLabel" TEXT,
ADD COLUMN     "locationSnapshot" JSONB;

-- AlterTable
ALTER TABLE "Exhibitor" ADD COLUMN     "externalReference" TEXT,
ADD COLUMN     "nameNormalized" TEXT;

-- CreateTable
CREATE TABLE "ExhibitorLocation" (
    "id" TEXT NOT NULL,
    "exhibitorId" TEXT NOT NULL,
    "type" "LocationType" NOT NULL,
    "code" TEXT NOT NULL,
    "codeNormalized" TEXT NOT NULL,
    "portCode" TEXT,
    "sectorCode" TEXT,
    "logisticSpace" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExhibitorLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogisticsPlanning" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "scope" "LogisticsPlanningScope" NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "portCode" TEXT,
    "sectorCode" TEXT,
    "spaceCode" TEXT,
    "categoryCode" TEXT NOT NULL DEFAULT 'ALL',
    "phase" "RxPhase" NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT,
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogisticsPlanning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT,
    "userId" TEXT,
    "sourceProfile" "ImportProfile" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHashSha256" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PROCESSING',
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "deactivated" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExhibitorLocation_exhibitorId_idx" ON "ExhibitorLocation"("exhibitorId");

-- CreateIndex
CREATE INDEX "ExhibitorLocation_codeNormalized_idx" ON "ExhibitorLocation"("codeNormalized");

-- CreateIndex
CREATE INDEX "ExhibitorLocation_sectorCode_idx" ON "ExhibitorLocation"("sectorCode");

-- CreateIndex
CREATE INDEX "ExhibitorLocation_logisticSpace_idx" ON "ExhibitorLocation"("logisticSpace");

-- CreateIndex
CREATE UNIQUE INDEX "ExhibitorLocation_exhibitorId_type_codeNormalized_key" ON "ExhibitorLocation"("exhibitorId", "type", "codeNormalized");

-- CreateIndex
CREATE INDEX "LogisticsPlanning_organizationId_eventId_scope_scopeKey_idx" ON "LogisticsPlanning"("organizationId", "eventId", "scope", "scopeKey");

-- CreateIndex
CREATE INDEX "LogisticsPlanning_organizationId_eventId_phase_date_idx" ON "LogisticsPlanning"("organizationId", "eventId", "phase", "date");

-- CreateIndex
CREATE INDEX "LogisticsPlanning_importBatchId_idx" ON "LogisticsPlanning"("importBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "LogisticsPlanning_organizationId_eventId_scopeKey_categoryC_key" ON "LogisticsPlanning"("organizationId", "eventId", "scopeKey", "categoryCode", "phase", "date", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "ImportBatch_organizationId_eventId_sourceProfile_fileHashSh_idx" ON "ImportBatch"("organizationId", "eventId", "sourceProfile", "fileHashSha256");

-- CreateIndex
CREATE INDEX "ImportBatch_eventId_idx" ON "ImportBatch"("eventId");

-- CreateIndex
CREATE INDEX "ImportBatch_userId_idx" ON "ImportBatch"("userId");

-- CreateIndex
CREATE INDEX "Accreditation_exhibitorId_idx" ON "Accreditation"("exhibitorId");

-- CreateIndex
CREATE INDEX "Accreditation_exhibitorLocationId_idx" ON "Accreditation"("exhibitorLocationId");

-- CreateIndex
CREATE INDEX "Exhibitor_eventId_nameNormalized_idx" ON "Exhibitor"("eventId", "nameNormalized");

-- AddForeignKey
ALTER TABLE "Accreditation" ADD CONSTRAINT "Accreditation_exhibitorId_fkey" FOREIGN KEY ("exhibitorId") REFERENCES "Exhibitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accreditation" ADD CONSTRAINT "Accreditation_exhibitorLocationId_fkey" FOREIGN KEY ("exhibitorLocationId") REFERENCES "ExhibitorLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExhibitorLocation" ADD CONSTRAINT "ExhibitorLocation_exhibitorId_fkey" FOREIGN KEY ("exhibitorId") REFERENCES "Exhibitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsPlanning" ADD CONSTRAINT "LogisticsPlanning_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsPlanning" ADD CONSTRAINT "LogisticsPlanning_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsPlanning" ADD CONSTRAINT "LogisticsPlanning_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
