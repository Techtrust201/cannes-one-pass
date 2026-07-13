# Checklist d'acceptation pré-cutover (Phase 8)

Ce document liste les critères vérifiables avant d'envisager la Phase 9
(cutover réel, non exécutée). Chaque ligne renvoie vers un test automatisé
existant dans le dépôt — cette checklist n'est pas déclarative, elle est
adossée à la suite `vitest`.

Pour rejouer l'ensemble : `npx vitest run` (suite complète) et
`npm run build` (build de production).

## 1. Moteur unique d'accréditation (Phases 2 et 4A)

- [ ] Création publique, back-office et duplication passent par le même
      moteur, sans `prisma.accreditation.create` direct hors du moteur.
      → `src/lib/accreditation-service.test.ts`
- [ ] La duplication conserve `exhibitorId`/`exhibitorLocationId`/
      `locationLabel`/`locationSnapshot` depuis la source, jamais depuis le
      client, et trace la duplication dans l'historique.
      → `src/app/api/accreditations/[id]/duplicate/route.test.ts`
- [ ] Un échec de rechargement post-commit ne renvoie jamais 500 après
      création réussie.
      → `src/app/api/accreditations/[id]/duplicate/route.test.ts`

## 2. Import généralisé (Phases 3, 4B, 5)

- [ ] Parsing CSV/XLSX + adaptateur RX (référentiel et planning), y compris
      cas réels (multi-valeurs, conflits port/secteur `PALAIS`).
      → `src/lib/imports/referential-rx-geography.test.ts`,
        `src/lib/imports/planning-rx-adapter.test.ts`
- [ ] FUSION idempotente (réimport identique = 0 création/0 modification).
      → `src/lib/imports/referential-commit.test.ts`,
        `src/lib/imports/planning-commit.test.ts`
- [ ] Import d'accréditations transactionnel : rollback total en cas
      d'échec, aucun `createAccreditation` en boucle (utilise
      `createAccreditationInTransaction`), e-mails uniquement après commit.
      → `src/lib/imports/accreditations-commit.test.ts`,
        `src/app/api/admin/import/accreditations/route.test.ts`
- [ ] Centre d'import unifié — profils Zones / Types de véhicules /
      Capacités, `eventId` optionnel géré correctement (`parseImportRequest`
      testé indirectement via chaque route).
      → `src/app/api/admin/import/zones/route.test.ts`,
        `src/app/api/admin/import/vehicle-types/route.test.ts`,
        `src/app/api/admin/import/capacities/route.test.ts`

## 3. Planning DB runtime (Phase 6)

- [ ] Résolution de portée SPACE > SECTOR > PORT > EVENT, catégorie exacte
      préférée à `ALL`, comportement `DISABLED`/`TRANSITION`/`STRICT`.
      → `src/lib/logistics-planning.test.ts`
- [ ] `GET /api/planning` : anti-IDOR (exhibitorId/exhibitorLocationId
      re-vérifiés), aucune fuite d'objet Prisma complet.
      → `src/app/api/planning/route.test.ts`
- [ ] `GET /api/exhibitors/[id]/locations` : scoping organisation/événement,
      anti-IDOR.
      → `src/app/api/exhibitors/[id]/locations/route.test.ts`
- [ ] Pont formulaire (`planning-bridge.ts`) : ne modifie jamais l'espace
      RX statique, ignore les résolutions non-DB, retire une catégorie en
      cas d'erreur STRICT.
      → `src/templates/accreditation/rx/planning-bridge.test.ts`
- [ ] Rattachement référentiel serveur à la création publique : jamais
      d'ID client accepté, résolution silencieuse en cas d'échec (jamais
      bloquant), Palais jamais concerné.
      → `src/app/api/accreditations/route.test.ts`

## 4. Purge d'organisation (Phase 7)

- [ ] Refus absolu du slug `palais`, quels que soient les arguments.
      → `src/lib/purge-organization.test.ts`
- [ ] Conjonction exacte des protections requise pour toute suppression
      réelle (org-id, org-slug=rx, confirm-slug identique, `--execute`,
      `--backup-confirmed`, variable d'environnement).
      → `src/lib/purge-organization.test.ts`
- [ ] Dry-run par défaut, purely lecture (aucun `deleteMany` appelé).
      → `src/lib/purge-organization.test.ts`
- [ ] Suppression scopée strictement par `organizationId` sur toutes les
      tables concernées, jamais sur `Organization`/`Event`/`User`/
      permissions/`ZoneConfig`/`VehicleTypeConfig`/`UnloadingProvider`.
      → `src/lib/purge-organization.test.ts`

## 5. Non-régression Palais

- [ ] Aucun fichier sous `src/templates/accreditation/palais/` modifié
      pendant les Phases 6-7-8 (vérifiable via `git diff --stat` sur les
      commits de ces phases).
- [ ] `resolvePublicReferential` n'est jamais appelé pour
      `organizationSlug !== "rx"`.
      → `src/app/api/accreditations/route.test.ts`
- [ ] `Event.logisticsPlanningMode` par défaut reste `DISABLED` : aucune
      migration de cette phase ne change une valeur existante (migration
      Phase 1 uniquement additive, aucune nouvelle migration dans les
      Phases 6-7-8).

## 6. Vérifications transverses obligatoires avant tout cutover réel

```bash
npm run typecheck
npx eslint src/lib/purge-organization.ts src/lib/logistics-planning.ts \
  src/app/api/planning src/app/api/exhibitors src/app/api/accreditations \
  src/templates/accreditation/rx
npx vitest run
npm run build
git diff --check
```

Tant que l'une de ces commandes n'est pas verte, la Phase 9 ne doit pas être
engagée.
