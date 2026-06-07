-- Jeton public non devinable pour le QR de suivi du PDF « demande »
-- (page /suivi/{token}), découplé de l'identifiant d'accès `id`.
ALTER TABLE "Accreditation" ADD COLUMN "publicToken" TEXT;
CREATE UNIQUE INDEX "Accreditation_publicToken_key" ON "Accreditation"("publicToken");
