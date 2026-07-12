# Contrat métier — Import généralisé (référentiel / planning / accréditations)

Statut : Phase 1 (modèle de données). Ce document décrit le contrat cible ;
plusieurs comportements ci-dessous sont implémentés dans des phases ultérieures
(Phase 2 pour le moteur, Phase 3+ pour les imports). Il sert de référence
partagée entre RX, le Palais et les futures organisations.

## 1. Trois profils d'import distincts

Le Centre d'import propose des profils séparés, jamais mélangés :

- **Référentiel** : exposants et leurs emplacements (terre / flot / stand),
  ports et secteurs. N'crée **aucune** accréditation.
- **Planning** : dates et créneaux de montage/démontage par jour. N'crée
  **aucune** accréditation.
- **Accréditations** : vraies demandes complètes (véhicules, créneaux…), qui
  passent par le **moteur unique** d'accréditation (Phase 2).

Profils additionnels prévus dans l'architecture (Phase 5) : **Zones**,
**Types de véhicules**, **Capacités**.

> Un import de référentiel ou de planning ne doit jamais générer d'accréditation.

## 2. Modèle Exhibitor / ExhibitorLocation

Une société (`Exhibitor`) peut posséder plusieurs emplacements
(`ExhibitorLocation`), potentiellement dans des ports/secteurs différents.

- `Exhibitor` porte l'identité : `name`, `nameNormalized`,
  `externalReference?`, `organizationId`, `eventId`, `isActive`.
  - `stand` (legacy) reste **obligatoire** en Phase 1 ; il sera déprécié
    (nullable) seulement en Phase 1C après validation de la transition.
  - `nameNormalized` est **nullable** en Phase 1 (table déjà remplie),
    rempli en Phase 1B, rendu obligatoire ensuite.
- `ExhibitorLocation` porte l'emplacement et sa géographie :
  `type` (TERRE | FLOT | STAND), `code`, `codeNormalized`, `portCode?`,
  `sectorCode?`, `logisticSpace?`, `isActive`.
  - Unicité : `(exhibitorId, type, codeNormalized)`.
  - Le référentiel RX contient des cellules multi-valeurs (`"PAN 023 / PAN 024"`) :
    le split `"/"` crée **plusieurs** emplacements distincts sur la même société.

Dans le formulaire : l'utilisateur choisit la société, puis l'emplacement
(auto-sélectionné s'il n'y en a qu'un). Chaque emplacement conduit vers son
secteur, son planning, ses catégories et ses règles.

## 3. Planning quotidien (générique RX + Palais)

Le planning logistique est stocké **en base**, à raison d'**une ligne par jour**
(`LogisticsPlanning`). Les plages Excel multi-jours sont découpées en lignes
quotidiennes au parsing.

### Portée (`scope` + `scopeKey`)

Chaque règle porte une **portée** (`LogisticsPlanningScope`) et une clé
canonique (`scopeKey`) :

| scope | scopeKey (exemple) | port/sector/space |
|---|---|---|
| `EVENT` | `"EVENT"` | tous null (Palais : règle événement entier) |
| `PORT` | `"PORT:PORT_CANTO"` | `portCode` renseigné |
| `SECTOR` | `"SECTOR:PORT_CANTO:POWER"` | port + secteur (+ espace si pertinent) |
| `SPACE` | `"SPACE:POWER"` | espace logistique cible |

Les champs `portCode`, `sectorCode`, `spaceCode` sont **optionnels** : une
organisation comme le Palais peut définir une règle au niveau événement sans
inventer de fausses valeurs `DEFAULT`.

`categoryCode` vaut `"ALL"` par défaut (toutes catégories) ; RX peut préciser
`BATEAU_TERRE`, `STAND_TENTE`, etc.

Clé d'unicité :

```
organizationId + eventId + scopeKey + categoryCode + phase + date + startTime + endTime
```

## 4. Modes de planning par événement

`Event.logisticsPlanningMode` (enum `LogisticsPlanningMode`) :

- **DISABLED** : comportement historique de l'organisation (défaut ; aucun
  changement pour les événements existants).
- **TRANSITION** : planning DB prioritaire, avec **fallback règle par règle**.
- **STRICT** : planning DB obligatoire ; l'absence de règle bloque côté public.

Bascule prévue : RX en TRANSITION avant l'import réel, puis STRICT après recette.
Le Palais peut rester DISABLED ou TRANSITION.

## 5. Priorité de résolution du planning

Lors de la résolution d'une règle (Phase 6), le moteur cherche dans cet ordre :

1. **Règle SPACE ou SECTOR précise** — la combinaison la plus spécifique
   correspondant au contexte (emplacement, port, secteur).
2. **Règle PORT** — si aucune règle SPACE/SECTOR ne couvre la demande.
3. **Règle EVENT** — règle générale au niveau événement (typique Palais :
   montage global sans port/secteur/espace).
4. **Fallback historique** — en mode **TRANSITION**, uniquement pour la
   combinaison absente en base (`planning-data.ts` pour RX, dates générales de
   l'événement pour le Palais).
5. **Blocage** — en mode **STRICT**, si aucune règle en base ne couvre la
   combinaison demandée.

En mode **TRANSITION**, la résolution reste **règle par règle** : la présence
partielle de planning DB (ex : POWER en base, JETEE non) ne désactive pas le
fallback des autres secteurs.

## 6. Quotas et parcage séparés du planning

- Les **quotas** (capacité par créneau) restent gérés par `RxCapacity` et le
  garde `enforceCapacityQuotas`. Le planning décrit les dates/créneaux
  autorisés ; il ne remplace pas les quotas.
- Le **parcage/zone automatique** reste calculé par `suggestZone` (gabarit ×
  secteur, via `VehicleTypeConfig`). Il est distinct du planning.

## 7. Moteur unique d'accréditation (Phase 2)

Toutes les voies de création (formulaire public, back-office, import
d'accréditations, duplication, future dérogation) passeront par un moteur
unique afin d'appliquer exactement les mêmes règles : validation, quotas,
parcage, historique, tokens, puis génération QR/PDF et e-mails.

- Dans la transaction : validation, verrou/quota, création Stand /
  Accreditation / Vehicle, historique, `publicToken`/`publicCode`, snapshots.
- Après le commit : e-mails, historique d'envoi, notifications. **Aucun e-mail
  n'est envoyé depuis une transaction DB.**

## 8. Dry-run sans écriture

- Le dry-run (aperçu) n'écrit **rien** en base : analyse en mémoire, preview et
  erreurs par ligne.
- Le preview de lot agrège les quotas entre les lignes d'un même fichier (il
  signale un dépassement interne), mais reste **informatif** : seul le **commit**
  fait foi (recalcul définitif sous transaction et verrou).
- `ImportBatch` est créé **au commit uniquement**, hors de la transaction
  métier, pour survivre à un rollback (status `PROCESSING` → `COMPLETED` /
  `FAILED`).

## 9. Mode FUSION par défaut

- **FUSION** (défaut) : crée les nouvelles données, met à jour les présentes,
  laisse **intactes** les données absentes du fichier. Aucun doublon au réimport
  (clé naturelle + `fileHashSha256`). **Pas de désactivation silencieuse.**
- **REMPLACEMENT COMPLET** (optionnel) : désactive les absents, uniquement avec
  confirmation explicite, aperçu des désactivations et permission dédiée.

## 10. Historique figé via locationSnapshot

Chaque accréditation figera, au moment de sa création, un `locationSnapshot`
(JSON) : `exhibitorName`, `locationType`, `locationCode`, `portCode`,
`sectorCode`, `spaceCode`, `categoryCode`, `phase`, date/créneau utilisés.

Les FK `exhibitor` / `exhibitorLocation` (en `SET NULL`) permettent la
navigation ; le snapshot garantit que PDF, e-mails et historique restent
cohérents même après un réimport ou une évolution du référentiel. Son
remplissage sera implémenté en Phase 2/4.
