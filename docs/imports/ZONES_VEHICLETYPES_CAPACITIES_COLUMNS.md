# Import Zones / Gabarits / Capacités — colonnes, règles et comportement

Routes :
- `POST /api/admin/import/zones`
- `POST /api/admin/import/vehicle-types`
- `POST /api/admin/import/capacities`

Ces trois profils suivent la même architecture que Référentiel/Planning/
Accréditations (Phase 3–4B) : parsing pur (aucune écriture), preview en
dry-run, commit transactionnel unique (FUSION), traçabilité `ImportBatch`.
Aucun UUID n'est jamais lu depuis le fichier : l'organisation (et l'événement
quand il est pertinent) vient exclusivement du contexte serveur (sélecteurs
de l'interface).

Mode **REPLACE** non disponible pour ces trois profils (comme Référentiel et
Planning) : seul **FUSION** est supporté — création des entrées absentes,
mise à jour de celles présentes si un champ diffère, **aucune désactivation
silencieuse**.

---

## 1. Profil Zones (`ZoneConfig`)

L'événement n'est **pas requis** : `ZoneConfig` n'a pas de champ `eventId`
(zones rattachées uniquement à l'organisation).

| Colonne canonique | Alias reconnus | Obligatoire | Note |
|---|---|---|---|
| `CODE` | ZONE, ZONE CODE, CODE ZONE | **oui** | Normalisé (majuscules, non-alphanumérique → `_`), identique à `POST /api/zones` |
| `LABEL` | LIBELLE, NOM | **oui** | |
| `ADDRESS` | ADRESSE | **oui** | |
| `LATITUDE` | LAT | **oui** | numérique |
| `LONGITUDE` | LON, LONG | **oui** | numérique |
| `IS FINAL DESTINATION` | DESTINATION FINALE | non | booléen (oui/non, true/false, 1/0) — défaut `false` à la création |
| `COLOR` | COULEUR | non | défaut `gray` |
| `IS ACTIVE` | ACTIF | non | défaut `true` — **jamais désactivé si la colonne est omise** |
| `READER NAME` | NOM LECTEUR | non | |
| `READER URL` | URL LECTEUR | non | doit commencer par `http://` ou `https://` |
| `READER ACTIVE` | LECTEUR ACTIF | non | défaut `false` |

Colonnes interdites (bloquent tout le fichier) : `ID`, `ORGANIZATION ID`.

Clé naturelle : `(organizationId, code normalisé)`. Un code déjà présent dans
le même fichier déclenche un avertissement `DUPLICATE_ZONE_CODE` (non
bloquant — la dernière occurrence l'emporte au commit).

**Impact scanner/quotas** : les zones importées sont immédiatement
utilisables par le scanner et par le profil Capacités (résolution par code).

---

## 2. Profil Gabarits / Types de véhicules (`VehicleTypeConfig`)

L'événement n'est **pas requis** (pas de champ `eventId` sur ce modèle).

| Colonne canonique | Alias reconnus | Obligatoire | Note |
|---|---|---|---|
| `CODE` | — | **oui** | normalisé en majuscules |
| `LABEL` | LIBELLE, NOM | **oui** | |
| `GABARIT` | SIZE, TAILLE, DIMENSIONS | **oui** | |
| `TONNAGE MINI` | TONNAGE MIN | **oui** | numérique (`,` ou `.` accepté) |
| `TONNAGE MOYEN` | — | **oui** | numérique |
| `TONNAGE MAXI` | TONNAGE MAX | **oui** | numérique |
| `CO2 COEFFICIENT` | COEFFICIENT CO2 | **oui** | numérique |
| `PDF CODE` | — | non | défaut `C` |
| `COLOR` | COULEUR | non | défaut `gray` |
| `SHOW TRAILER PLATE` | PLAQUE REMORQUE | non | booléen, défaut `false` |
| `VEHICLE FAMILY` | FAMILLE | non | **`LIGHT` ou `HEAVY` uniquement — jamais déduit automatiquement** ; vide = non renseigné |
| `RX ZONE CANTO` | — | non | code `ZoneConfig` cible (routage RX) |
| `RX ZONE VIEUX PORT` | — | non | code `ZoneConfig` cible (routage RX) |
| `SORT ORDER` | ORDRE, ORDRE AFFICHAGE | non | entier, défaut `0` |
| `IS ACTIVE` | ACTIF | non | défaut `true`, jamais désactivé si omis |

Colonne `displayLabels` (traductions JSON) **non supportée** par l'import —
reste éditable uniquement via l'interface d'administration des gabarits.

Colonnes interdites : `ID`, `ORGANIZATION ID`.

Clé naturelle : `(organizationId, code)`. Un code dupliqué dans le fichier
déclenche `DUPLICATE_CODE` (avertissement, non bloquant).

**Impact règles de zone/quotas** : les gabarits importés (avec leur
`vehicleFamily` LIGHT/HEAVY) sont immédiatement utilisables par les règles
de zone existantes et par le profil Capacités.

---

## 3. Profil Capacités (`RxCapacity`)

L'organisation **et** l'événement sont requis (clé naturelle du modèle).

| Colonne canonique | Alias reconnus | Obligatoire |
|---|---|---|
| `ZONE` | CODE ZONE | **oui** — doit exister et être **active** dans l'organisation |
| `DATE` | — | **oui** — format `YYYY-MM-DD` |
| `START TIME` | DEBUT, HEURE DEBUT | **oui** — format `HH:MM` |
| `END TIME` | FIN, HEURE FIN | **oui** — strictement après `START TIME` |
| `VEHICLE FAMILY` | FAMILLE | **oui** — `LIGHT` ou `HEAVY` |
| `PHASE` | — | **oui** — `MONTAGE` ou `DEMONTAGE` |
| `CAPACITY` | CAPACITE | **oui** — entier ≥ 1 |

Colonnes interdites : `ID`, `ORGANIZATION ID`, `EVENT ID` (l'organisation et
l'événement viennent exclusivement des sélecteurs de l'interface).

**Clé naturelle exacte** (identique à `RxCapacity.@@unique`) :

```
organizationId + eventId + zone + date + startTime + endTime + vehicleFamily + phase
```

Une même clé répétée dans le fichier déclenche `DUPLICATE_CAPACITY_KEY`
(avertissement non bloquant — la dernière occurrence l'emporte). Une même
zone/plage horaire peut porter des capacités différentes selon
`vehicleFamily` (LIGHT/HEAVY) et `phase` (MONTAGE/DEMONTAGE) : ce sont des
créneaux distincts.

**Aucune accréditation n'est jamais supprimée** par cet import, même en cas
de modification ou de réduction d'une capacité existante — seule la valeur
`capacity` du créneau est créée ou mise à jour.

---

## 4. Dry-run et atomicité (commun aux trois profils)

- Dry-run (`commit` absent ou `false`) : parsing + validation complets,
  **aucune écriture**, aucun `ImportBatch` créé, retourne les erreurs/
  avertissements et un aperçu (10 premières lignes).
- Commit (`commit=true`) : `ImportBatch` créé en `PROCESSING` **hors**
  transaction (survit à un rollback), puis une **unique transaction**
  applique toutes les lignes valides. Toute erreur dans la transaction
  entraîne un rollback complet (aucune écriture partielle) et
  `ImportBatch` passe en `FAILED` avec le résumé d'erreur conservé. En cas
  de succès, `ImportBatch` passe en `COMPLETED` avec les compteurs
  créés/mis à jour/inchangés.

## 5. Permissions

| Profil | Feature |
|---|---|
| Zones | `GESTION_ZONES` (écriture) |
| Gabarits | `FLUX_VEHICULES` (écriture) |
| Capacités | `FLUX_VEHICULES` (écriture) |

Aucune nouvelle `Feature` Prisma n'a été créée : ces profils réutilisent
exactement les permissions déjà en vigueur sur les routes CRUD équivalentes
(`/api/zones`, `/api/vehicle-types`, `/api/capacities`).
