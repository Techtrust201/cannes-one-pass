# Purge d'une organisation — `scripts/purge-organization.ts` (Phase 7)

Statut : outil livré, **jamais exécuté** contre une base réelle dans le cadre
de cette phase. Ce document décrit son fonctionnement, ses protections et la
procédure d'utilisation pour la purge des données de test RX avant cutover.

## 1. Objectif

Permettre de vider entièrement les données métier **de test** d'une seule
organisation (RX) sans jamais :

- toucher à l'organisation Palais ;
- supprimer `Organization`, `Event`, `User`, les permissions ou les liens
  utilisateur/organisation ;
- supprimer la configuration transverse (`ZoneConfig`, `VehicleTypeConfig`,
  `UnloadingProvider`).

## 2. Périmètre supprimé

Pour l'organisation ciblée uniquement :

- `Accreditation` (cascade Prisma/Postgres : `Vehicle`, `AccreditationHistory`,
  `AccreditationEmailHistory`, `ZoneMovement`, `VehicleTimeSlot`, `ChatMessage`) ;
- `AccreditationHistoryArchive` (pas de cascade FK — supprimé explicitement
  par la liste des `accreditationId` de l'organisation, **avant** la
  suppression des accréditations elles-mêmes) ;
- `SupportTicket` (cascade : `SupportTicketReply`) ;
- `ExhibitorLocation` puis `Exhibitor` ;
- `Stand` ;
- `RxCapacity` ;
- `LogisticsPlanning` ;
- `ImportBatch`.

## 3. Architecture du code

- `src/lib/purge-organization.ts` — cœur **pur** (aucun `console`, aucun
  `process`, aucun accès réseau). Contient `parseArgs`, `validatePurgeGuards`,
  `computePurgeCounts`, `executeOrganizationPurge`, `formatPurgeCountsReport`.
  Testé unitairement dans `src/lib/purge-organization.test.ts` (délégué
  `PurgeDb` mocké, aucune base réelle nécessaire).
- `scripts/purge-organization.ts` — orchestration I/O uniquement (dotenv,
  connexion Prisma, `process.argv`, affichage). Ne contient **aucune**
  logique de garde dupliquée : il appelle uniquement les fonctions pures.

## 4. Protections absolues (conjonction EXACTE requise pour supprimer)

| Protection | Détail |
|---|---|
| `--org-id=<uuid>` | UUID exact de l'organisation ciblée |
| `--org-slug=rx` | Doit être **littéralement** `rx` — `palais` est refusé de manière absolue, quels que soient les autres arguments |
| `--confirm-slug=rx` | Doit être **strictement identique** à `--org-slug` (double frappe volontaire) |
| `--execute` | Sans ce flag : dry-run systématique, quelle que soit la présence des autres protections |
| `--backup-confirmed` | Confirmation explicite qu'une sauvegarde existe avant de continuer |
| `ALLOW_ORGANIZATION_PURGE=YES` | Variable d'environnement, jamais un argument CLI (évite un historique shell dangereux) |
| Slug résolu en base == argument fourni | L'UUID doit réellement correspondre au slug donné (anti-erreur de copier-coller) |

Si **une seule** de ces conditions manque et que `--execute` est demandé :
refus immédiat, code de sortie non nul, **aucune transaction ouverte,
aucune suppression**. Sans `--execute` du tout : dry-run (lecture seule),
quelle que soit la présence des autres protections.

## 5. Utilisation

### Dry-run (lecture seule, comportement par défaut)

```bash
npx tsx scripts/purge-organization.ts --org-id=<uuid> --org-slug=rx
```

Affiche uniquement des compteurs (nombre de lignes par table concernée).
Aucune donnée n'est modifiée. C'est le mode à utiliser systématiquement
avant toute suppression réelle, et celui utilisé pour vérifier après coup
qu'une purge s'est bien déroulée (tous les compteurs doivent retomber à
zéro).

### Suppression réelle

```bash
ALLOW_ORGANIZATION_PURGE=YES npx tsx scripts/purge-organization.ts \
  --org-id=<uuid> --org-slug=rx --confirm-slug=rx \
  --execute --backup-confirmed
```

Ouvre **une seule** transaction Prisma. En cas d'échec à n'importe quelle
étape, la transaction est intégralement annulée (aucune suppression
partielle). À la fin, le script recompte automatiquement et alerte si des
lignes subsistent.

## 6. Ce que cet outil ne fait jamais

- Ne supprime jamais l'organisation Palais, quels que soient les arguments
  (refus absolu codé en dur, indépendant de la base).
- Ne supprime jamais `Organization`, `Event`, `User`, permissions, liens
  utilisateur/organisation, `ZoneConfig`, `VehicleTypeConfig`,
  `UnloadingProvider`.
- N'a jamais été exécuté contre Neon dans le cadre des Phases 6-7-8: seule
  la suite de tests unitaires (`src/lib/purge-organization.test.ts`) a été
  exécutée, avec un délégué de base entièrement mocké.
