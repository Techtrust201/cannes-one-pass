# Template CSV — Règles par stand / emplacement (ACCESS_RULES)

Profil d’import unifié : une ligne CSV crée des règles `LogisticsPlanning` en
scope **LOCATION** (une ligne par jour), et optionnellement une capacité
`RxCapacity` sur le même scope si `CAPACITY` est renseignée.

## Fichiers

| Fichier | Usage |
| --- | --- |
| `public/templates/rx-regles-stands-emplacements-template.csv` | Modèle vide (en-têtes) |
| `public/templates/rx-regles-stands-emplacements-example.csv` | Exemple structurel (non production) |
| Centre d’import → « Règles par stand / emplacement » | Dry-run puis commit FUSION |

API : `POST /api/admin/import/access-rules`  
Permission : `GESTION_DATES` (écriture au commit)  
Mode : **FUSION** uniquement (aucune désactivation silencieuse des absents).

## Colonnes

| Colonne | Obligatoire | Notes |
| --- | --- | --- |
| EVENT | non | Informatif (l’événement vient du contexte serveur) |
| COMPANY | oui | Nom exposant (résolu via `nameNormalized`) |
| LOCATION TYPE | non | `TERRE` / `FLOT` / `STAND` (désambiguïsation) |
| LOCATION CODE | oui | Code emplacement (normalisé) |
| PORT | non | Métadonnée planning |
| SECTOR | non | Métadonnée planning |
| LOGISTIC SPACE | non | → `spaceCode` |
| WAITING ZONE | si CAPACITY | Code `ZoneConfig` actif ; → `zoneCode` / `RxCapacity.zone` |
| PHASE | oui | `MONTAGE` ou `DEMONTAGE` |
| DATE START | oui | `YYYY-MM-DD` ou `DD/MM/YYYY` |
| DATE END | non | Défaut = DATE START ; plage découpée jour par jour |
| START TIME | oui | `HH:MM` |
| END TIME | oui | `HH:MM` (strictement après START) |
| VEHICLE FAMILY | si CAPACITY | `LIGHT` ou `HEAVY` |
| ALLOWED VEHICLE TYPES | non | Codes gabarit séparés par `/` ou `,` |
| CAPACITY | non | Entier ≥ 1 ; **vide = planning seul** |
| COMMENT | non | Texte libre |

Alias FR acceptés pour la plupart des en-têtes (ex. `SOCIETE`, `CAPACITE`,
`ZONE ATTENTE`, `HEURE DEBUT`…).

## Règles métier

1. **Résolution** : exposant par nom normalisé, emplacement par
   `codeNormalized` (+ type) **parmi les emplacements de cet exposant**.
2. **Atomicité** : si `CAPACITY` est invalide / famille ou zone manquante →
   **toute la ligne** est rejetée (aucun planning partiel).
3. **CAPACITY vide** : planning LOCATION uniquement, pas de `RxCapacity`.
4. **Idempotence** :
   - planning : `organizationId + eventId + scopeKey + categoryCode + phase + date + startTime + endTime`
     avec `scopeKey = LOCATION:<exhibitorLocationId>` et `categoryCode = ALL`
     (sauf colonne CATEGORY fournie) ;
   - capacité : `organizationId + eventId + scopeKey + date + startTime + endTime + vehicleFamily + phase`.
5. **Dry-run** : aucune écriture ; le commit passe par `ImportBatch` +
   transaction unique planning + capacités.

## Ordre recommandé

1. Exposants & emplacements (référentiel)
2. Planning général
3. **Règles par stand / emplacement** ← ce profil
4. Capacités / quotas (zones globales)
5. Accréditations

## Exemple

Voir `public/templates/rx-regles-stands-emplacements-example.csv`.  
Les valeurs de capacité de l’exemple sont **illustratives** uniquement — ne
pas les utiliser comme quotas de production.
