-- Dissociation des gabarits (VehicleTypeConfig) et zones (ZoneConfig) par
-- organisation. Même principe que les prestataires : on rattache l'existant
-- (globaux, organizationId NULL) à l'org Palais historique, puis on duplique
-- pour RX. Palais garde donc exactement sa configuration ; RX obtient une
-- copie indépendante. Les futures orgs sont seedées à leur création (code).
--
-- NB : VehicleTypeConfig.id et ZoneConfig.id sont des serial (autoincrement),
-- on n'insère donc PAS la colonne id (laissée au défaut de séquence).

-- ── Gabarits ───────────────────────────────────────────────────────
-- 1) Rattacher les gabarits globaux à Palais
UPDATE "VehicleTypeConfig"
SET "organizationId" = (SELECT id FROM "Organization" WHERE slug = 'palais-des-festivals')
WHERE "organizationId" IS NULL
  AND EXISTS (SELECT 1 FROM "Organization" WHERE slug = 'palais-des-festivals');

-- 2) Copier les gabarits de Palais vers RX
INSERT INTO "VehicleTypeConfig"
  ("code", "label", "gabarit", "tonnageMini", "tonnageMoyen", "tonnageMaxi",
   "co2Coefficient", "pdfCode", "color", "showTrailerPlate", "sortOrder",
   "isActive", "organizationId", "createdAt", "updatedAt")
SELECT src."code", src."label", src."gabarit", src."tonnageMini", src."tonnageMoyen",
  src."tonnageMaxi", src."co2Coefficient", src."pdfCode", src."color",
  src."showTrailerPlate", src."sortOrder", src."isActive", rx.id, now(), now()
FROM "VehicleTypeConfig" src
CROSS JOIN (SELECT id FROM "Organization" WHERE slug = 'rx') rx
WHERE src."organizationId" = (SELECT id FROM "Organization" WHERE slug = 'palais-des-festivals')
ON CONFLICT ("code", "organizationId") DO NOTHING;

-- ── Zones ──────────────────────────────────────────────────────────
-- 3) Rattacher les zones globales à Palais
UPDATE "ZoneConfig"
SET "organizationId" = (SELECT id FROM "Organization" WHERE slug = 'palais-des-festivals')
WHERE "organizationId" IS NULL
  AND EXISTS (SELECT 1 FROM "Organization" WHERE slug = 'palais-des-festivals');

-- 4) Copier les zones de Palais vers RX
INSERT INTO "ZoneConfig"
  ("zone", "label", "address", "latitude", "longitude", "isFinalDestination",
   "color", "isActive", "organizationId", "createdAt", "updatedAt")
SELECT src."zone", src."label", src."address", src."latitude", src."longitude",
  src."isFinalDestination", src."color", src."isActive", rx.id, now(), now()
FROM "ZoneConfig" src
CROSS JOIN (SELECT id FROM "Organization" WHERE slug = 'rx') rx
WHERE src."organizationId" = (SELECT id FROM "Organization" WHERE slug = 'palais-des-festivals')
ON CONFLICT ("zone", "organizationId") DO NOTHING;
