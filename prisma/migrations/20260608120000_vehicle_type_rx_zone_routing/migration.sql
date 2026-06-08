-- Table de routage RX configurable : zone de déchargement cible par gabarit et
-- par port (Port Canto / Vieux Port). Remplace progressivement le flag binaire
-- `rxPalmBeachAtCanto` (conservé comme repli).
ALTER TABLE "VehicleTypeConfig" ADD COLUMN IF NOT EXISTS "rxZoneCanto" TEXT;
ALTER TABLE "VehicleTypeConfig" ADD COLUMN IF NOT EXISTS "rxZoneVieuxPort" TEXT;

-- Backfill : on reproduit exactement la matrice actuelle pour l'organisation RX
-- uniquement (jamais le Palais), afin que le comportement reste identique et que
-- l'UI affiche des valeurs cohérentes dès la migration.
UPDATE "VehicleTypeConfig" AS vtc
SET
  "rxZoneCanto" = CASE WHEN vtc."rxPalmBeachAtCanto" THEN 'PALM_BEACH' ELSE 'LA_BOCCA' END,
  "rxZoneVieuxPort" = 'LA_BOCCA'
FROM "Organization" AS o
WHERE vtc."organizationId" = o."id"
  AND o."slug" = 'rx';
