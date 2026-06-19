-- Ordre d'affichage configurable des prestataires de déchargement, par
-- organisation, piloté depuis le back-office (onglet Prestataires).
-- DEFAULT 0 : les prestataires existants conservent un ordre neutre et restent
-- triés alphabétiquement (repli `name ASC` côté API) tant qu'aucun ordre n'a
-- été défini. Migration non destructive.
ALTER TABLE "UnloadingProvider" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
