-- Lot 2 (réglage) — Expéditeur e-mail automatique par organisation.
-- Ajout non destructif sur Organization :
--   emailFromName       : nom affiché de l'expéditeur
--   emailFromAddress    : adresse d'envoi (domaine autorisé/vérifié requis)
--   replyToEmail        : adresse de réponse propre à l'organisation
--   emailSendingEnabled : envoi automatique activé pour l'organisation
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "emailFromName" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "emailFromAddress" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "replyToEmail" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "emailSendingEnabled" BOOLEAN NOT NULL DEFAULT true;
