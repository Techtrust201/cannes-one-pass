-- Nettoyage des champs de routage RX qui ont fui sur l'organisation Palais.
-- La migration `20260607160000_vehicle_type_rx_palm_beach` a flaggé
-- `rxPalmBeachAtCanto` sur TOUTES les organisations (sans filtre), alors que
-- la matrice Palm Beach / Port Canto est spécifique à RX (cf. rx-zone-rules.ts).
-- On remet à zéro ces champs pour le Palais uniquement, sans toucher aux
-- libellés, gabarits, tonnages ou codes du catalogue Palais.
UPDATE "VehicleTypeConfig" AS vtc
SET
  "rxPalmBeachAtCanto" = false,
  "rxZoneCanto" = NULL,
  "rxZoneVieuxPort" = NULL
FROM "Organization" AS o
WHERE vtc."organizationId" = o."id"
  AND o."slug" = 'palais-des-festivals';
