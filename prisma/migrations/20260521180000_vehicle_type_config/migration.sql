-- CreateTable
CREATE TABLE "VehicleTypeConfig" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "gabarit" TEXT NOT NULL,
    "tonnageMini" DOUBLE PRECISION NOT NULL,
    "tonnageMoyen" DOUBLE PRECISION NOT NULL,
    "tonnageMaxi" DOUBLE PRECISION NOT NULL,
    "co2Coefficient" DOUBLE PRECISION NOT NULL,
    "pdfCode" TEXT NOT NULL DEFAULT 'C',
    "color" TEXT NOT NULL DEFAULT 'gray',
    "showTrailerPlate" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleTypeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VehicleTypeConfig_code_key" ON "VehicleTypeConfig"("code");

-- Convert Vehicle.vehicleType from enum to text
ALTER TABLE "Vehicle" ALTER COLUMN "vehicleType" TYPE TEXT USING "vehicleType"::text;

-- DropEnum
DROP TYPE IF EXISTS "VehicleType";

-- Seed default vehicle types
INSERT INTO "VehicleTypeConfig" (
    "code", "label", "gabarit", "tonnageMini", "tonnageMoyen", "tonnageMaxi",
    "co2Coefficient", "pdfCode", "color", "showTrailerPlate", "sortOrder", "isActive", "updatedAt"
) VALUES
    ('VL', 'Fourgon / VL', 'VL', 1.8, 2.8, 3.5, 0.12, 'A', 'gray', false, 1, true, CURRENT_TIMESTAMP),
    ('PORTEUR_LEGER', 'Porteur léger (10 m³)', '10 m³', 7.5, 10, 12, 0.18, 'B', 'green', false, 2, true, CURRENT_TIMESTAMP),
    ('PORTEUR', 'Porteur moyen (15 m³)', '15 m³', 12, 15, 19, 0.22, 'C', 'blue', false, 3, true, CURRENT_TIMESTAMP),
    ('GROS_PORTEUR', 'Gros porteur (20 m³)', '20 m³', 16, 19, 26, 0.30, 'C', 'orange', false, 4, true, CURRENT_TIMESTAMP),
    ('PORTEUR_ARTICULE', 'Porteur articulé', '~100 m³', 12, 19, 26, 0.385, 'C', 'yellow', false, 5, true, CURRENT_TIMESTAMP),
    ('SEMI_REMORQUE', 'Semi-remorque', '~90 m³', 15, 29.5, 44, 0.485, 'D', 'red', true, 6, true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
