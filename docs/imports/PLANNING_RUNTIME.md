# Planning runtime — résolution DB dans les formulaires publics (Phase 6)

Statut : Phase 6 corrigée côté **client/formulaire** par le lot 6C-A
(emplacement/espace effectifs, hook planning structuré, garde plages
disjointes — voir section 4 et 7) **ET côté serveur** par le lot 6C-B
(référentiel fiable D2 + double revalidation planning D3, branchés dans les
quatre canaux de création — formulaire public/back-office, duplication,
import unifié, import legacy — voir section 5). Ce document décrit le
fonctionnement réel du pont entre le planning importé en base
(`LogisticsPlanning`) et les formulaires publics RX (montage/démontage).
Aucun comportement Palais n'est concerné par cette phase.

## 1. Principe : additif, jamais bloquant tant que `DISABLED`

Chaque `Event` porte un champ `logisticsPlanningMode`, qui pilote à la fois
le caractère obligatoire de l'emplacement référentiel et la résolution du
planning (cf. `docs/rx/RX_CUTOVER.md` pour la matrice complète) :

- **`DISABLED`** (valeur par défaut sur tous les événements existants) : le
  formulaire fonctionne **exactement** comme avant cette phase. Emplacement
  facultatif (résolution best-effort). Aucune requête de fusion n'a d'effet
  visible — l'API `/api/planning` répond `source: "NONE"` et aucun override
  n'est appliqué (`applyPlanningOverrides` retourne l'espace legacy
  inchangé).
- **`TRANSITION`** : emplacement référentiel **obligatoire** (zéro
  emplacement bloque le formulaire, message traduit). Les catégories pour
  lesquelles une règle DB existe affichent les créneaux importés ; une règle
  absente **confirmée par le serveur** (`PLANNING_NOT_FOUND`) fait retomber
  silencieusement la catégorie sur le planning statique
  (`planning-data.ts` / `RX_SPACES`) ; une erreur réseau/HTTP retombe aussi
  sur le legacy, mais affiche un avertissement non bloquant (jamais confondue
  avec une absence de règle confirmée — cf. section 4).
- **`STRICT`** : emplacement référentiel **obligatoire**. Toute catégorie
  sans règle DB confirmée pour l'emplacement résolu, OU dont la résolution a
  échoué (réseau/HTTP), reçoit une erreur bloquante affichée à l'utilisateur
  (aucun créneau inventé, aucun repli legacy silencieux — cf. section 4).

Le passage de `DISABLED` à `TRANSITION`/`STRICT` est un choix opérationnel
qui n'est **jamais** fait automatiquement par le code — c'est une opération
manuelle en base, hors du périmètre de cette phase.

## 2. Chaîne de résolution

```
StepExhibitorRx (choix emplacement, obligatoire en TRANSITION/STRICT — D1)
        │  exhibitorId + exhibitorLocationId résolus côté client
        │  resolveEffectiveRxSpace()/resolveEffectiveRxSector() — config.ts (purs)
        │  priorité : logisticSpace de l'emplacement > sectorCode dérivé >
        │             secteur legacy (DISABLED/TRANSITION uniquement)
        ▼
StepDeliveryRx / StepPickupRx
        │  useRxPlanningOverrides({ orgSlug, eventSlug, location, phase, categoryIds, mode })
        │  → { overrides, loading, errorsByCategory, hasFetchError, mode }
        │  AbortController : une réponse d'un ancien exposant/emplacement/mode
        │  n'écrase jamais la sélection courante
        ▼
GET /api/planning?orgSlug=...&eventSlug=...&exhibitorId=...&exhibitorLocationId=...&phase=...&categoryCode=...
        │  anti-IDOR : exhibitorId/exhibitorLocationId re-vérifiés contre l'event résolu
        ▼
resolvePlanning() — src/lib/logistics-planning.ts (pur, sans Prisma)
        │  priorité de portée : SPACE > SECTOR > PORT > EVENT
        │  priorité de catégorie : code exact > "ALL"
        │  garde plages disjointes (mergeDailyRanges) — cf. section 7
        ▼
buildPlanningOverridesFromOutcomes() — planning-bridge.ts (pur)
        │  décision par mode (DISABLED/TRANSITION/STRICT) — cf. section 4
        ▼
applyPlanningOverrides() — src/templates/accreditation/rx/planning-bridge.ts (pur)
        │  fusionne dans une COPIE de l'espace RX statique, ne modifie jamais RX_SPACES
        ▼
Espace RX final utilisé pour l'affichage des créneaux montage/démontage
```

## 3. Résolution de portée (`resolvePlanning`)

Ordre de préférence (du plus spécifique au plus général), un seul niveau
retenu — jamais de fusion entre niveaux :

1. `SPACE:<logisticSpace>`
2. `SECTOR:<sectorCode>`
3. `PORT:<portCode>`
4. `EVENT` (règle globale, utile pour le Palais si activé un jour)

Pour un niveau candidat, le code de catégorie exact (ex. `PONTON_PRIVATIF`)
est préféré à la catégorie générique `ALL`. Dès qu'un niveau produit au
moins une ligne pour la phase demandée (MONTAGE/DEMONTAGE), la recherche
s'arrête — pas de cascade partielle entre niveaux pour une même catégorie.

## 4. Comportement en cas d'échec (F3/D1 — cf. `buildPlanningOverridesFromOutcomes`)

Le hook client distingue explicitement une **règle absente confirmée par le
serveur** (`PLANNING_NOT_FOUND`, réponse HTTP 200 avec `error`) d'une
**erreur locale** (réseau, HTTP non-200, réponse invalide) : ces deux cas ne
sont **jamais** traités de la même façon en `STRICT`.

- `STRICT` + règle absente confirmée par le serveur → `PlanningResolution.error
  = { code: "PLANNING_NOT_FOUND", ... }`. La catégorie reçoit une erreur
  bloquante : `StepDeliveryRx`/`StepPickupRx` affichent un message traduit
  (`t.rx.planningError.unavailable`), désactivent la sélection de cette
  catégorie et vident toute date/créneau déjà choisi — jamais de disparition
  silencieuse, jamais de créneau inventé.
- `STRICT` + erreur réseau/HTTP locale → **également bloquant** (résolution
  d'erreur synthétique construite côté client), pour ne jamais interpréter un
  incident technique comme une absence de règle acceptable. Aucun repli
  legacy silencieux dans ce mode, quelle que soit la cause de l'échec.
- `TRANSITION` + règle absente confirmée par le serveur → repli silencieux
  sur la donnée statique locale déjà chargée (comportement identique à
  `DISABLED` pour cette seule catégorie).
- `TRANSITION` + erreur réseau/HTTP locale → repli sur la donnée statique
  locale **avec un avertissement non bloquant** (`hasFetchError=true`),
  distinct du cas précédent : l'absence de règle n'est jamais supposée à
  partir d'une erreur technique.
- `DISABLED` → aucun appel réseau n'est émis (`loading=false` immédiatement).

⚠️ Ce comportement ne concerne que l'**affichage** côté client, une aide à la
saisie — jamais une source de confiance. Voir section 5 : depuis le lot
6C-B, la création serveur revalide intégralement le référentiel ET le
planning au moment du commit, quel que soit ce que l'affichage client a pu
montrer.

## 5. Référentiel et planning revalidés côté serveur (lot 6C-B)

Depuis le lot 6C-B, **les quatre canaux de création** (formulaire
public/back-office `POST /api/accreditations`, duplication
`POST /api/accreditations/[id]/duplicate`, import unifié
`POST /api/admin/import/accreditations`, import legacy
`POST /api/admin/accreditations/import`) passent EXCLUSIVEMENT par le moteur
unique `accreditation-service.ts` (`previewAccreditation` +
`createAccreditationInTransaction`) — aucun canal n'écrit
`accreditation.create` directement, aucune logique de validation dupliquée.

- **D2 — Référentiel fiable** (`resolveTrustedAccreditationReferential`,
  `src/lib/accreditation-referential.ts`) : tout `exhibitorId`/
  `exhibitorLocationId` transmis (client ou canal serveur) n'est qu'une
  INDICATION, systématiquement rechargée et revérifiée (organisation,
  événement, `isActive`, relation emplacement→exposant). En
  `TRANSITION`/`STRICT`, une incohérence (inactif, hors périmètre,
  introuvable) est un refus contrôlé (409, messages anti-IDOR uniformes,
  jamais de résolution silencieuse sur un tiers). En `DISABLED`, un
  identifiant incohérent est ignoré (repli best-effort, y compris un
  snapshot historique pour la duplication) — comportement legacy inchangé.
- **D3 — Double revalidation planning** (`validateAccreditationPlanning`,
  `src/lib/accreditation-planning-validation.ts`) : `extension.categories[]`
  (jamais les `vehicles[]` racine, manipulables côté client) est validé
  DEUX FOIS — une première fois au preview (lecture), une seconde fois DANS
  la transaction de commit (avec le `logisticsPlanningMode` rechargé à cet
  instant). Un planning modifié entre le preview et le commit (règle
  supprimée, emplacement désactivé) fait échouer/rollback le commit — jamais
  de création avec des données périmées.
- **Quotas réalignés** : en `TRANSITION`/`STRICT`, les candidats de quota
  sont calculés depuis la projection canonique `PlanningPhaseEntry`
  (dérivée d'`extension.categories[]` validé), pas depuis les `vehicles[]`
  racine.
- **Erreurs structurées** : `RxServerValidationError` (400/409/503) et
  `CapacityQuotaError` (409) conservent leur `code`/`status` jusqu'à la
  réponse HTTP sur les quatre canaux — jamais un 500 générique pour une
  incohérence métier déjà identifiée.
- **Duplication** : en `DISABLED`, le snapshot référentiel de la source est
  préservé (FK nulles autorisées, aucune rupture des accréditations
  historiques) ; en `TRANSITION`/`STRICT`, l'exposant ET l'emplacement
  ACTUELS du parent sont revalidés contre les règles ACTUELLES de
  l'événement — jamais celles en vigueur à la création de la source.
- **Import (unifié et legacy)** : le référentiel déjà résolu par le
  résolveur naturel propre aux fichiers (`accreditations-referential-resolver.ts`,
  jamais dupliqué) est transmis comme indication au moteur pour revalidation
  — protection contre un exposant/emplacement désactivé entre le preview et
  le commit d'un gros lot.

## 6. Ce que les lots 6C-A/6C-B ne font PAS

- Ne modifient aucune donnée en base au-delà des accréditations créées via
  le moteur unique.
- Ne basculent aucun `Event.logisticsPlanningMode` en production (opération
  manuelle, hors périmètre).
- Ne suppriment pas `planning-data.ts` (repli legacy toujours actif en
  `DISABLED`/`TRANSITION`).
- Ne modifient pas le formulaire Palais ni son moteur de validation (aucun
  fichier `templates/accreditation/palais/*` touché ; `previewAccreditation`
  ne déclenche la revalidation RX que pour `organizationSlug === "rx"`).

## 7. Garde plages horaires disjointes (`PLANNING_DISJOINT_RANGES`)

Le modèle autorise plusieurs plages le même jour pour une règle de planning.
`resolvePlanning()` (runtime) et le parsing d'import (`parsePlanningTable`,
preview) partagent la même fonction pure `mergeDailyRanges` (cf.
`src/lib/logistics-planning.ts`) :

- plages qui se chevauchent ou se touchent (ex. `08:00-12:00` et
  `12:00-14:00`) → fusion autorisée, comportement `genSlots`/
  `inclusiveLastStart` inchangé ;
- plages réellement disjointes le même jour (ex. `08:00-10:00` et
  `14:00-18:00`) → erreur structurée `PLANNING_DISJOINT_RANGES`, bloquante
  à l'import (preview, avant tout commit) et au runtime (jamais de créneau
  `min(start)-max(end)` inventé à travers le trou).
