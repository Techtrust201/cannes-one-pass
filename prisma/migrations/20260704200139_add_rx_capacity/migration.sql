-- CreateEnum
CREATE TYPE "VehicleFamily" AS ENUM ('LIGHT', 'HEAVY');

-- CreateEnum
CREATE TYPE "RxPhase" AS ENUM ('MONTAGE', 'DEMONTAGE');

-- AlterTable
ALTER TABLE "VehicleTypeConfig" ADD COLUMN "vehicleFamily" "VehicleFamily";

-- CreateTable
CREATE TABLE "rx_capacity" (
    "id" SERIAL NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "vehicleFamily" "VehicleFamily" NOT NULL,
    "phase" "RxPhase" NOT NULL,
    "capacity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rx_capacity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rx_capacity_organizationId_eventId_zone_date_idx" ON "rx_capacity"("organizationId", "eventId", "zone", "date");

-- CreateIndex
CREATE UNIQUE INDEX "rx_capacity_organizationId_eventId_zone_date_startTime_endT_key" ON "rx_capacity"("organizationId", "eventId", "zone", "date", "startTime", "endTime", "vehicleFamily", "phase");

-- AddForeignKey
ALTER TABLE "rx_capacity" ADD CONSTRAINT "rx_capacity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rx_capacity" ADD CONSTRAINT "rx_capacity_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
