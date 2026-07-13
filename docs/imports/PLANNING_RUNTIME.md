# Planning runtime — résolution DB dans les formulaires publics (Phase 6)

Statut : Phase 6 implémentée. Ce document décrit le fonctionnement réel du
pont entre le planning importé en base (`LogisticsPlanning`) et les
formulaires publics RX (montage/démontage). Aucun comportement Palais n'est
concerné par cette phase.

## 1. Principe : additif, jamais bloquant tant que `DISABLED`

Chaque `Event` porte un champ `logisticsPlanningMode` :

- **`DISABLED`** (valeur par défaut sur tous les événements existants) : le
  formulaire fonctionne **exactement** comme avant cette phase. Aucune requête
  de fusion n'a d'effet visible — l'API `/api/planning` répond `source: "NONE"`
  et aucun override n'est appliqué (`applyPlanningOverrides` retourne l'espace
  legacy inchangé).
- **`TRANSITION`** : les catégories pour lesquelles une règle DB existe
  affichent les créneaux importés ; les catégories sans règle DB gardent le
  planning statique (`planning-data.ts` / `RX_SPACES`) en repli.
- **`STRICT`** : toute catégorie sans règle DB pour l'emplacement résolu
  est retirée des choix proposés (aucun créneau inventé, aucun repli legacy).

Le passage de `DISABLED` à `TRANSITION`/`STRICT` est un choix opérationnel
qui n'est **jamais** fait automatiquement par le code — c'est une opération
manuelle en base, hors du périmètre de cette phase.

## 2. Chaîne de résolution

```
StepExhibitorRx (choix emplacement)
        │  exhibitorId + exhibitorLocationId résolus côté client
        ▼
StepDeliveryRx / StepPickupRx
        │  useRxPlanningOverrides({ orgSlug, eventSlug, location, phase, categoryIds })
        ▼
GET /api/planning?orgSlug=...&eventSlug=...&exhibitorId=...&exhibitorLocationId=...&phase=...&categoryCode=...
        │  anti-IDOR : exhibitorId/exhibitorLocationId re-vérifiés contre l'event résolu
        ▼
resolvePlanning() — src/lib/logistics-planning.ts (pur, sans Prisma)
        │  priorité de portée : SPACE > SECTOR > PORT > EVENT
        │  priorité de catégorie : code exact > "ALL"
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

## 4. Comportement en cas d'échec

- `STRICT` sans règle trouvée à aucun niveau → `PlanningResolution.error =
  { code: "PLANNING_NOT_FOUND", ... }`. Le pont retire alors la catégorie
  des choix proposés (jamais un créneau inventé, jamais un blocage brutal :
  la catégorie disparaît simplement du formulaire).
- `TRANSITION` sans règle trouvée → repli sur la donnée statique locale déjà
  chargée (comportement identique à `DISABLED` pour cette seule catégorie).
- Erreur réseau/HTTP côté client (`useRxPlanningOverrides`) → catégorie
  traitée comme "pas d'override", jamais de blocage de formulaire.

## 5. Rattachement référentiel à la création (`POST /api/accreditations`)

Indépendamment de l'affichage des créneaux, la création publique RX tente de
résoudre `exhibitorId`/`exhibitorLocationId`/`locationLabel`/`locationSnapshot`
via `resolveReferential` (même moteur que l'import CSV et la duplication),
à partir du **nom d'exposant** et du **code d'emplacement naturel** envoyés
par le client — jamais à partir d'un identifiant fourni par le client.

- Échec de résolution (ambigu, introuvable) → `referential = undefined`,
  la création se poursuit normalement (`exhibitorId`/`exhibitorLocationId`
  restent `null`, comportement legacy).
- Organisation ≠ `rx` (ex. Palais) → aucune tentative de résolution.
- Toute erreur (Prisma, réseau) est absorbée : elle ne fait jamais échouer
  la création de l'accréditation.

## 6. Ce que cette phase ne fait PAS

- Ne modifie aucune donnée en base.
- Ne bascule aucun `Event.logisticsPlanningMode` en production.
- Ne supprime pas `planning-data.ts` (repli legacy toujours actif).
- Ne modifie pas le formulaire Palais (aucun fichier `templates/accreditation/palais/*` touché).
