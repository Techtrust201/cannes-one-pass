# Procédure de cutover RX (Phase 9 — non exécutée)

Statut : ce document décrit la procédure **prévue** pour la Phase 9. Aucune
étape de ce document n'a été exécutée. La Phase 9 ne sera engagée qu'après
validation explicite et finale du porteur du projet, quoi qu'il arrive.

## 1. Pré-requis (doivent tous être vrais avant d'envisager le cutover)

- [ ] Phases 0 à 8 committées et poussées, CI verte (typecheck, lint, tests,
      build).
- [ ] `docs/rx/PRE_CUTOVER_ACCEPTANCE.md` entièrement rempli et validé.
- [ ] Sauvegarde Neon récente confirmée (export ou snapshot daté), en dehors
      de ce dépôt.
- [ ] Credentials Neon/Supabase régénérés et à jour dans Vercel (suivi hors
      de ce document, déjà traité séparément).
- [ ] Import référentiel + planning RX réels validés en dry-run (aucune
      donnée réelle importée avant la fenêtre de cutover elle-même).

## 2. Étapes prévues (ordre strict)

1. **Fenêtre de maintenance courte** annoncée aux utilisateurs RX concernés.
2. **Purge des données de test RX** via `scripts/purge-organization.ts`
   (dry-run d'abord, puis suppression réelle avec toutes les protections —
   voir `docs/rx/RX_PURGE.md`).
3. **Import référentiel réel** (exposants + emplacements) via
   `POST /api/admin/import/referential?format=rx`, en mode dry-run puis
   commit.
4. **Import planning réel** (montage/démontage) via
   `POST /api/admin/import/planning?format=rx`, en mode dry-run puis commit.
5. **Vérification croisée** : un échantillon d'emplacements retrouve bien
   ses règles de planning (`GET /api/planning`), avec les clés canoniques
   attendues (y compris le cas `PALAIS int/ext` normalisé côté port —
   cf. `planning-rx-adapter.ts`).
6. **Bascule progressive du mode planning** :
   `Event.logisticsPlanningMode` : `DISABLED` → `TRANSITION` (jamais
   directement `STRICT`). Observation du formulaire public en conditions
   réelles pendant une période à définir.
7. **Bascule finale** `TRANSITION` → `STRICT` uniquement après confirmation
   qu'aucune catégorie légitime ne tombe en erreur `PLANNING_NOT_FOUND`.
8. **Import des accréditations pré-remplies** (si applicable), via
   `POST /api/admin/import/accreditations`, dry-run puis commit, avec
   `importMode` choisi explicitement (`PENDING` ou `VALIDATED`).

## 3. Rollback à chaque étape

- Import référentiel/planning/accréditations : chaque commit est
  transactionnel (tout ou rien). En cas d'anomalie détectée après coup,
  relancer un nouvel import corrigé (FUSION) plutôt que de tenter un
  rollback manuel en base.
- Mode planning : repasser `Event.logisticsPlanningMode` à `DISABLED`
  annule immédiatement tout effet visible côté formulaire (repli sur
  `planning-data.ts`), sans aucune perte de données en base.
- Purge : irréversible par construction (suppression réelle). Ne jamais
  exécuter sans sauvegarde confirmée au préalable (`--backup-confirmed`
  n'est qu'une confirmation déclarative, pas une sauvegarde automatique).

## 4. Ce qui reste explicitement hors de cette phase

- Aucune modification du formulaire Palais.
- Aucune suppression de `planning-data.ts` (conservé comme repli permanent
  tant que `logisticsPlanningMode` n'est pas `STRICT` partout).
- Aucun changement de rôle/permission Prisma.
