-- Lot 3 — Lecteur de plaque configurable par zone (version simple).
-- Ajout non destructif de 3 colonnes sur ZoneConfig :
--   readerName   : nom du lecteur (libellé)
--   readerUrl    : lien/URL du lecteur (http/https, validé côté serveur)
--   readerActive : lecteur actif/affiché dans le module de scan
ALTER TABLE "ZoneConfig" ADD COLUMN IF NOT EXISTS "readerName" TEXT;
ALTER TABLE "ZoneConfig" ADD COLUMN IF NOT EXISTS "readerUrl" TEXT;
ALTER TABLE "ZoneConfig" ADD COLUMN IF NOT EXISTS "readerActive" BOOLEAN NOT NULL DEFAULT false;
