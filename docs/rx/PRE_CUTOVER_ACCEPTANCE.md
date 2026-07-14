# Checklist d'acceptation pré-cutover (Phase 8)

Ce document liste les critères vérifiables avant d'envisager la Phase 9
(cutover réel, non exécutée). Chaque ligne renvoie vers un test automatisé
existant dans le dépôt — cette checklist n'est pas déclarative, elle est
adossée à la suite `vitest`.

⚠️ **Phases 6/7/8 NON acceptées à ce stade.** Le lot 6C-A (corrections
client/formulaire : emplacement/espace effectifs, hook planning structuré,
garde plages disjointes, purge, documentation) a été livré et est en attente
de revue humaine du diff avant commit. Le lot 6C-B (validation planning +
résolution référentielle hybride côté serveur, décisions D1/D2/D3) n'a **pas
été commencé**. La section 3 ci-dessous reflète l'état réel du code, pas un
objectif atteint — ne pas cocher les cases avant la livraison ET la revue du
lot 6C-B.

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
      préférée à `ALL`, comportement `DISABLED`/`TRANSITION`/`STRICT`,
      garde plages disjointes (`PLANNING_DISJOINT_RANGES`, F7).
      → `src/lib/logistics-planning.test.ts`
- [ ] Détection des plages disjointes au preview d'import planning (jamais
      de créneau `min(start)-max(end)` inventé à travers un trou).
      → `src/lib/imports/planning.test.ts`
- [ ] `GET /api/planning` : anti-IDOR (exhibitorId/exhibitorLocationId
      re-vérifiés), aucune fuite d'objet Prisma complet.
      → `src/app/api/planning/route.test.ts`
- [ ] `GET /api/exhibitors/[id]/locations` : scoping organisation/événement,
      anti-IDOR.
      → `src/app/api/exhibitors/[id]/locations/route.test.ts`
- [ ] Espace/secteur effectifs RX (F1) : priorité `logisticSpace` de
      l'emplacement > dérivation `sectorCode` > secteur legacy
      (`DISABLED`/`TRANSITION` uniquement, jamais `STRICT`) ; toutes les
      clés produites correspondent à `RX_SPACES`.
      → `src/templates/accreditation/rx/config.effective.test.ts`
- [ ] `EventOption` conserve `logisticsPlanningMode` renvoyé par
      `GET /api/events` (F8), repli `DISABLED` si absent/inconnu.
      → `src/components/accreditation/event-carousel-mapper.test.ts`
- [ ] Décision pure par mode du hook planning client (F3/F4) : `DISABLED`
      sans fetch, `TRANSITION` repli silencieux sur règle absente confirmée
      mais avertissement non bloquant sur erreur réseau/HTTP, `STRICT`
      bloquant dans tous les cas d'échec (jamais de repli silencieux).
      → `src/templates/accreditation/rx/planning-bridge.test.ts`,
        `src/templates/accreditation/rx/use-planning-overrides.test.ts`
- [ ] Pont formulaire (`planning-bridge.ts`) : ne modifie jamais l'espace
      RX statique, ignore les résolutions non-DB, retire une catégorie en
      cas d'erreur STRICT.
      → `src/templates/accreditation/rx/planning-bridge.test.ts`
- [ ] ⛔ **NON livré (lot 6C-B)** — Résolution référentielle hybride
      serveur (D2) et double revalidation planning preview +
      transaction (D3) dans `accreditation-service.ts`. L'état actuel
      (résolution naturelle uniquement, erreurs absorbées, aucun ID client
      re-vérifié) est documenté dans `docs/imports/PLANNING_RUNTIME.md` §5
      et ne doit PAS être considéré comme acceptable pour `TRANSITION`/
      `STRICT` en production.
      → à couvrir par de nouveaux tests lors du lot 6C-B (aucun test
        existant ne couvre D1/D2/D3 à ce jour).

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
- [ ] Orchestration CLI (`scripts/purge-organization.ts`, F10) : aucun
      `process.exit()` à l'intérieur de `main()`, erreurs contrôlées
      (`PurgeCliError`) + `process.exitCode = 1` dans le `.catch()` final,
      un seul `prisma.$disconnect()` dans un `.finally()` unique quel que
      soit le chemin (succès, dry-run, garde refusée, erreur).
      → vérification par relecture du fichier (pas de test automatisé :
        le script orchestre une vraie connexion Prisma, volontairement non
        exécuté pendant l'audit/la correction — aucune écriture réelle,
        aucune base réelle sollicitée).

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
