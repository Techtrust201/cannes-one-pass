-- Dissociation des prestataires de déchargement par organisation.
--
-- Contexte : la migration 20260528120000_multi_org_extensions a ajouté
-- UnloadingProvider.organizationId sans backfill. Tous les prestataires
-- legacy sont donc restés globaux (organizationId NULL) et apparaissaient
-- dans TOUS les espaces. On les rattache à l'org historique Palais des
-- Festivals (qui ne change donc pas de comportement), ce qui isole RX et
-- les futures organisations.

-- 1a. Rattacher les prestataires legacy (globaux) à l'org Palais historique.
UPDATE "UnloadingProvider"
SET "organizationId" = (SELECT "id" FROM "Organization" WHERE "slug" = 'palais-des-festivals')
WHERE "organizationId" IS NULL
  AND EXISTS (SELECT 1 FROM "Organization" WHERE "slug" = 'palais-des-festivals');

-- 1b. Seeder les prestataires propres à RX (si l'org RX existe).
INSERT INTO "UnloadingProvider" ("id", "name", "isActive", "organizationId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), v.name, true, o."id", now(), now()
FROM (VALUES ('SVMM'), ('Mathez'), ('Scales')) AS v(name)
CROSS JOIN "Organization" o
WHERE o."slug" = 'rx'
ON CONFLICT ("name", "organizationId") DO NOTHING;
