-- Flag RX par gabarit : Palm Beach au Port Canto (matrice Mathieu §8.4).
ALTER TABLE "VehicleTypeConfig" ADD COLUMN IF NOT EXISTS "rxPalmBeachAtCanto" BOOLEAN NOT NULL DEFAULT false;

UPDATE "VehicleTypeConfig"
SET "rxPalmBeachAtCanto" = true
WHERE "code" IN ('VL', 'PORTEUR_LEGER', 'GROS_PORTEUR');
