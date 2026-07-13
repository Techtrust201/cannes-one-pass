# Import — Profil Planning logistique

Route : `POST /api/admin/import/planning`
Permission requise : `GESTION_DATES` (write).
Champs multipart : `file` (**CSV ou XLSX**), `organizationId`, `eventId`.
Query : `commit=true` pour appliquer (sinon **dry-run** sans écriture DB) ;
`mode=FUSION` par défaut (`REPLACE` refusé en Phase 3) ;
`format=canonical|rx` (défaut `canonical`).

`organizationId`/`eventId` proviennent **uniquement du contexte serveur** (champ
multipart validé contre le périmètre de l'utilisateur). Aucune organisation
n'est lue depuis le **contenu** du fichier.

## Deux chemins d'entrée

1. **Format canonique plat** (`format=canonical`, CSV ou XLSX) : une ligne par
   règle, colonnes ci-dessous. Utilisable par toute organisation.
2. **Classeur RX matriciel** (`format=rx`, XLSX officiel `CYF26-planning.xlsx`) :
   deux sections `MONTAGE`/`DEMONTAGE`, lignes
   `PORT | ZONE T-T | PONTON PRIVATIF(4 col) | TERRE(4 col) | BATEAUX A TERRE(4 col)`,
   dates en série Excel. Un **adaptateur isolé**
   (`src/lib/imports/planning-rx-adapter.ts`) le convertit vers des lignes
   canoniques **scope `SECTOR`**, sans jamais toucher au moteur générique.
   - Chaque ligne est résolue au niveau **secteur** via exactement la même
     logique que le référentiel (`parseLegacySector`) → les `scopeKey`
     correspondent entre un emplacement importé et sa règle de planning
     (`SECTOR:<portCode>:<sectorCode>`, ex. `SECTOR:PORT_CANTO:POWER`,
     `SECTOR:PALAIS:PALAIS_INT_NU`). Les secteurs distincts ne sont jamais
     fusionnés (SAIL Multicoque ≠ Monocoque, PALAIS int-NU ≠ int-Equipe).
   - Catégories issues des 3 blocs : `PONTON_PRIVATIF`, `TERRE`, `BATEAUX_A_TERRE`.
   - **Exception RX documentée** : dans le planning, les secteurs PALAIS sont
     indiqués sous `PORT = VIEUX PORT` alors que le référentiel utilise
     `PORT = PALAIS`. Ce port legacy est normalisé vers `PALAIS` **uniquement**
     dans l'adaptateur (warning `RX_LEGACY_PORT_NORMALIZED`), pour garantir des
     clés identiques. `parseLegacySector` (générique) reste inchangé.

## Objet

Alimente `LogisticsPlanning` (**une ligne par jour**). Le format canonique est
un **format long** : une ligne par règle, avec une plage de dates éventuelle
découpée en jours.

### Stratégie FUSION (complète)

FUSION = { **création**, **mise à jour**, **inchangé**, **conservation des
absents** }. Identité logique (rapprochement explicite) : la **jour-combinaison**
`(scopeKey, categoryCode, phase, date)`.

- Créneau identique `(startTime,endTime)` → **inchangé** (aucune écriture).
- Exactement 1 créneau entrant + 1 existant non appariés sur la même
  jour-combinaison → **mise à jour de l'horaire** (jamais de doublon ; l'ancienne
  plage n'est pas laissée active).
- Plusieurs créneaux le même jour → **création** des nouveaux, **conservation**
  des existants (jamais de désactivation) ; cas ambigu signalé en `warnings`.
- Une règle absente du fichier n'est **jamais** désactivée.

## Portée (`scope`) et clé canonique

Le champ `SCOPE` détermine les codes obligatoires et la forme de `scopeKey` :

| `SCOPE` | Codes requis | `scopeKey` généré |
|---|---|---|
| `EVENT` | aucun | `EVENT` |
| `PORT` | `PORT` | `PORT:<portCode>` |
| `SECTOR` | `PORT` + `SECTOR` | `SECTOR:<portCode>:<sectorCode>` |
| `SPACE` | `SPACE` | `SPACE:<spaceCode>` |

Les codes RX (`PORT`, `SECTOR`) sont canonicalisés (`PORT CANTO` → `PORT_CANTO`,
`PAN` → `PANTIERO`…) pour s'aligner sur les emplacements du référentiel. Pour
une organisation non-RX, les codes sont conservés tels quels (normalisés).

## Colonnes

| Champ logique | Alias d'entête acceptés | Obligatoire | Description |
|---|---|---|---|
| Portée | `SCOPE`, `PORTEE` | **Oui** | `EVENT`, `PORT`, `SECTOR` ou `SPACE`. |
| Port | `PORT`, `PORTCODE`, `PORT CODE` | selon scope | Port. |
| Secteur | `SECTOR`, `SECTEUR`, `ZONE T-T`, `ZONE` | selon scope | Secteur. |
| Espace | `SPACE`, `ESPACE`, `SPACECODE`, `ESPACE LOGISTIQUE` | selon scope | Espace logistique. |
| Catégorie | `CATEGORY`, `CATEGORIE`, `CATEGORYCODE` | Non | Défaut `ALL`. Ex RX : `BATEAU_TERRE`. |
| Phase | `PHASE` | **Oui** | `MONTAGE` ou `DEMONTAGE`. |
| Date début | `DATE`, `DATE_START`, `DATE START`, `DATE DEBUT`, `DEBUT`, `JOUR` | **Oui** | `DD/MM/YYYY` ou `YYYY-MM-DD`. |
| Date fin | `DATE_END`, `DATE END`, `DATE FIN`, `FIN` | Non | Plage inclusive ; défaut = date début. |
| Heure début | `START_TIME`, `START TIME`, `HEURE DEBUT` | **Oui** | `HH:MM` (accepte `8h30`, `8:30`). |
| Heure fin | `END_TIME`, `END TIME`, `HEURE FIN` | **Oui** | `HH:MM`, strictement > heure début. |

### Règles

- **Découpe quotidienne** : une plage `DATE`..`DATE_END` génère une ligne par
  jour (garde anti-explosion : 366 jours max). Pour le classeur RX, la convention
  officielle s'applique (1er jour : heure début → 23:00 ; dernier : 08:00 → heure
  fin ; jours intermédiaires 08:00 → 23:00).
- **Validation stricte** : scope/phase/date/heures invalides → erreur par ligne,
  import bloqué (rien écrit).

## Templates réellement téléchargeables

- Modèle vide : `GET /api/admin/import/template?profile=planning&kind=empty`
- Exemple rempli : `GET /api/admin/import/template?profile=planning&kind=example`

(Réponse `text/csv` en pièce jointe.) Le classeur RX matriciel n'a pas de
template : il est consommé tel quel via `format=rx`.

### Aperçu du format canonique

```csv
SCOPE,PORT,SECTOR,SPACE,CATEGORY,PHASE,DATE START,DATE END,START TIME,END TIME
SECTOR,PORT CANTO,POWER,,STAND_TENTE,MONTAGE,04/09/2026,06/09/2026,08:00,18:00
EVENT,,,,,DEMONTAGE,10/09/2026,,09:00,17:00
SPACE,,,POWER,BATEAU_TERRE,DEMONTAGE,16/09/2026,17/09/2026,12:00,17:00
```

## Réponses

- `200 { ok:true, mode:"dry-run", totalRows, warnings, preview }` — simulation.
- `200 { ok:true, mode:"commit", batchId, warnings, imported:{created,updated,unchanged} }`.
- `422 { ok:false, errors, warnings, preview }` — validation échouée (rien écrit).
- `400/403/413` — requête invalide / hors périmètre / fichier trop volumineux /
  type non supporté (ni CSV ni XLSX).
- `500 { ok:false, error }` — transaction annulée, `ImportBatch` en `FAILED`.
