-- Index de performance pour le dashboard back-office (filtres espace/statut,
-- tri par date). Additifs : aucun impact fonctionnel.
CREATE INDEX IF NOT EXISTS "Accreditation_organizationId_isArchived_status_idx"
  ON "Accreditation"("organizationId", "isArchived", "status");
CREATE INDEX IF NOT EXISTS "Accreditation_eventId_isArchived_idx"
  ON "Accreditation"("eventId", "isArchived");
CREATE INDEX IF NOT EXISTS "Accreditation_isArchived_createdAt_idx"
  ON "Accreditation"("isArchived", "createdAt");
