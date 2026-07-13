# Import — Profil Référentiel (exposants & emplacements)

Route : `POST /api/admin/import/referential`
Permission requise : `GESTION_ESPACES` (write).
Champs multipart : `file` (**CSV ou XLSX**), `organizationId`, `eventId`.
Query :
- `commit=true` pour appliquer (sinon **dry-run** sans écriture DB) ;
- `mode=FUSION` par défaut (`REPLACE` refusé en Phase 3) ;
- **`format=canonical|rx`** (défaut `canonical`).

### Paramètre `format` (important pour RX)

| Valeur | Comportement |
|---|---|
| `canonical` (défaut) | Parseur générique prudent. Les lignes `VIEUX PORT` + `PALAIS ext` produisent un conflit `PORT_SECTOR_CONFLICT`. |
| **`rx`** | **Obligatoire pour le fichier officiel RX** (`CYF26-listeTT-*.xlsx`). Active l'adaptateur géographique RX : normalise `VIEUX PORT` + `PALAIS ext` vers `portCode=PALAIS`, compatible avec le planning RX (`format=rx` côté planning). |

Exemple dry-run RX :
```
POST /api/admin/import/referential?format=rx
```

Validation locale hors CI (fichiers non versionnés) :
```
npx tsx scripts/validate-rx-import-files.ts \
  --referential=/chemin/CYF26-listeTT-1007.xlsx \
  --planning=/chemin/CYF26-planning\ \(1\).xlsx
```

`organizationId`/`eventId` proviennent **uniquement du contexte serveur** (champ
multipart validé contre le périmètre de l'utilisateur). Aucune organisation
n'est lue depuis le **contenu** du fichier. Le fichier RX officiel
`CYF26-listeTT-*.xlsx` est directement lisible (dépendance `xlsx`).

## Objet

Crée/enrichit les **exposants** (`Exhibitor`) et leurs **emplacements**
(`ExhibitorLocation` de type `TERRE`, `FLOT` ou `STAND`) pour un événement.
Stratégie **FUSION** : création des absents, mise à jour des présents, aucun
emplacement désactivé silencieusement. Idempotent au réimport.

## Colonnes

Les entêtes sont insensibles à la casse et aux accents. Plusieurs alias sont
acceptés (le premier présent est retenu).

| Champ logique | Alias d'entête acceptés | Obligatoire | Description |
|---|---|---|---|
| Nom exposant | `COMPANY NAME`, `COMPANY`, `PLAN`, `NAME`, `NOM`, `SOCIETE`, `EXPOSANT`, `RAISON SOCIALE` | **Oui** | Raison sociale (RX : `COMPANY NAME`). Clé naturelle (via `nameNormalized`). |
| Référence externe | `EXTERNAL REFERENCE`, `REFERENCE`, `REF`, `REF EXTERNE`, `ID EXTERNE` | Non | Identifiant fourni par l'organisation source. |
| Port | `PORT`, `PORTCODE`, `PORT CODE` | Non | Port (RX). Canonicalisé (`PORT CANTO` → `PORT_CANTO`). |
| Secteur | `ZONE T-T`, `ZONE TT`, `ZONE`, `SECTEUR`, `SECTOR` | Non | Secteur logique (RX). Canonicalisé (`POWER`, `JETEE`, `PANTIERO`…). |
| Emplacements terre | `NUM-TERRE`, `NUM TERRE`, `N TERRE`, `TERRE` | Non | Un ou plusieurs codes séparés par `/`. |
| Emplacements flot | `NUM-FLOT`, `NUM FLOT`, `N FLOT`, `FLOT` | Non | Un ou plusieurs codes séparés par `/`. |
| Stand générique | `STAND`, `NUM-STAND`, `NUM STAND`, `N STAND`, `NUMERO STAND` | Non | Emplacement de type `STAND` (Palais/organisations sans terre/flot). |

### Règles

- **Multi-valeurs** : une cellule `NUM-TERRE`/`NUM-FLOT`/`STAND` peut contenir
  plusieurs codes séparés par `/` (ex : `PAN 023 / PAN 024`) → un emplacement
  par code.
- **Géographie canonique** : `PORT` + `SECTEUR` sont convertis en
  `portCode`/`sectorCode`/`logisticSpace` via exactement la même logique que le
  backfill legacy (Phase 1B), afin que les emplacements importés portent les
  **mêmes codes** que le planning. En cas de contradiction entre le port
  explicite et le port impliqué par le secteur, `portCode` reste `null`,
  l'emplacement est marqué ambigu et un avertissement `PORT_SECTOR_CONFLICT` est
  émis (aucun arbitrage silencieux).
- **Fusion exposant** : les lignes partageant le même nom normalisé sont
  fusionnées (leurs emplacements sont cumulés).
- **Dédoublonnage emplacement** : clé `(type, code normalisé)`. `JETEE 001` et
  `JETEE-001` désignent le même emplacement. `NUM-TERRE` **et** `NUM-FLOT` sont
  lus tous les deux (jamais `flot || terre`).
- **Au moins un emplacement obligatoire** : une ligne sans `NUM-TERRE`,
  `NUM-FLOT` **ni** `STAND` est une **erreur** de dry-run (jamais importée
  silencieusement). L'absence totale de colonne d'emplacement bloque l'import.

### Champ legacy `stand` — miroir temporaire

La création d'un `Exhibitor` requiert encore le champ legacy **`stand`**
(obligatoire jusqu'en Phase 1C). À l'import, il est **dérivé du premier
emplacement réel** selon la priorité déterministe `STAND` > `TERRE` > `FLOT`.
Il n'est **JAMAIS** rempli avec le nom de la société (ce serait une fausse
donnée). La source de vérité reste `ExhibitorLocation` ; tous les emplacements
`TERRE`/`FLOT` sont conservés.

## Templates réellement téléchargeables

- Modèle vide : `GET /api/admin/import/template?profile=referential&kind=empty`
- Exemple rempli : `GET /api/admin/import/template?profile=referential&kind=example`

(Réponse `text/csv` en pièce jointe.) Ces entêtes sont également valides en XLSX.

### Aperçu du modèle

```csv
PORT,ZONE T-T,COMPANY NAME,NUM-TERRE,NUM-FLOT
Sunseeker Exemple,PORT CANTO,POWER,POWER 209,POWER 210
Multi Stand Exemple,VIEUX PORT,PAN,PAN 023 / PAN 024,
```

## Réponses

- `200 { ok:true, mode:"dry-run", totalRows, warnings, preview }` — simulation.
- `200 { ok:true, mode:"commit", batchId, imported }` — appliqué.
- `422 { ok:false, errors, warnings, preview }` — validation échouée (rien écrit).
- `400/403/413` — requête invalide / hors périmètre / fichier trop volumineux /
  type non supporté (ni CSV ni XLSX).
- `500 { ok:false, error }` — transaction annulée (aucune donnée écrite),
  `ImportBatch` conservé en `FAILED`.
