# Import d'accréditations — colonnes, règles et comportement

Route : `POST /api/admin/import/accreditations`

Cette page documente le profil d'import générique **Accréditations**, unique
pour toutes les organisations (Palais et RX). Le fichier ne contient jamais
de données de sécurité : l'organisation, l'événement, le statut et les
identifiants internes viennent **exclusivement** du contexte serveur (les
sélecteurs de l'interface), jamais du contenu du fichier.

Toute accréditation importée passe par le **même moteur** que le formulaire
public, le back-office et la duplication : mêmes validations, mêmes quotas,
même historique, même jeton public, même e-mail post-création.

## 1. Organisation et événement

L'organisation et l'événement sont sélectionnés **dans l'interface** avant
l'import (formulaire multipart `organizationId` + `eventId`). Ils ne peuvent
jamais être modifiés par le fichier : toute colonne `ORGANIZATION ID`,
`EVENT ID`, `STATUS`, `ACTOR SOURCE`, `EXHIBITOR ID`, `EXHIBITOR LOCATION ID`
ou `LOCATION SNAPSHOT` est **interdite** (`FORBIDDEN_COLUMN`) et bloque tout
le fichier.

Le template utilisé (Palais ou RX) est déterminé automatiquement par
l'organisation choisie — aucun paramètre à fournir dans le fichier.

## 2. Colonnes communes (tous templates)

| Colonne canonique | Alias reconnus (extraits) | Obligatoire |
|---|---|---|
| `COMPANY` | SOCIETE, ENTREPRISE, RAISON SOCIALE | Palais : non (déduit du référentiel si résolu) · RX : non (déduit de l'exposant) |
| `STAND` | NO STAND, NUM STAND | non |
| `EMAIL` | E-MAIL, MAIL, COURRIEL | **oui (Palais)** |
| `LANGUAGE` | LANGUE, LANG | non |
| `MESSAGE` | COMMENTAIRE, NOTE | non |
| `CATEGORY` | CATEGORIE | non (déduction automatique sinon) |
| `UNLOADING` | DECHARGEMENT | non |
| `PLATE` | PLAQUE, IMMATRICULATION | **oui (Palais)** · facultatif (RX) |
| `TRAILER PLATE` | PLAQUE REMORQUE | non |
| `VEHICLE TYPE` | TYPE VEHICULE, GABARIT | **oui (RX)** |
| `SIZE` | TAILLE | non (Palais) |
| `PHONE CODE` / `PHONE NUMBER` | INDICATIF / TELEPHONE | non |
| `DATE` / `TIME` | DATE VEHICULE / HEURE, CRENEAU | non |
| `CITY`, `COUNTRY`, `KMS`, `ESTIMATED KMS` | VILLE, PAYS, KM… | non |

## 3. Rattachement exposant / emplacement (facultatif Palais, obligatoire RX)

| Colonne canonique | Alias reconnus |
|---|---|
| `EXHIBITOR EXTERNAL REFERENCE` | REFERENCE EXTERNE, REF EXTERNE |
| `EXHIBITOR NAME` | EXPOSANT, NOM EXPOSANT |
| `LOCATION CODE` | EMPLACEMENT, CODE EMPLACEMENT |
| `LOCATION TYPE` | TYPE EMPLACEMENT (TERRE / FLOT / STAND) |

Le fichier **ne fournit jamais d'UUID**. La résolution se fait côté serveur :
- exposant : par `EXHIBITOR EXTERNAL REFERENCE` (priorité) ou `EXHIBITOR NAME`
  normalisé, scopé organisation + événement ;
- emplacement : par `LOCATION TYPE` + `LOCATION CODE` normalisé, au sein de
  l'exposant résolu.

Toute référence ambiguë ou introuvable produit une erreur explicite
(`EXHIBITOR_NOT_FOUND`, `EXHIBITOR_AMBIGUOUS`, `LOCATION_NOT_FOUND`,
`LOCATION_AMBIGUOUS`, `LOCATION_EXHIBITOR_MISMATCH`) — jamais un rattachement
approximatif.

Pour **RX**, l'exposant ET l'emplacement sont **obligatoires** : sans
résolution réussie, la ligne est rejetée.

## 4. Colonnes spécifiques RX (contact, montage/démontage, reprise)

Le référentiel `Exhibitor` ne stocke **aucune** coordonnée de contact : pour
RX, le contact vient **exclusivement du fichier**.

| Colonne canonique | Alias reconnus | Obligatoire (RX) |
|---|---|---|
| `CONTACT FIRST NAME` | PRENOM CONTACT | recommandé |
| `CONTACT LAST NAME` | NOM CONTACT | recommandé |
| `CONTACT EMAIL` | EMAIL CONTACT | recommandé |
| `CONTACT PHONE CODE` / `CONTACT PHONE NUMBER` | INDICATIF CONTACT / TELEPHONE CONTACT | recommandé |
| `SPACE` | ESPACE, ESPACE LOGISTIQUE | non |
| `CATEGORY ID` | CATEGORIE ID | non |
| `LIV DATE` / `LIV TIME` | DATE MONTAGE / CRENEAU MONTAGE | montage |
| `REP DATE` / `REP TIME` | DATE DEMONTAGE / CRENEAU DEMONTAGE | démontage |
| `REP SAME AS DELIVERY` | REPRISE IDENTIQUE | non |
| `REP VEHICLE TYPE`, `REP PLATE`, `REP PHONE CODE`, `REP PHONE NUMBER`, `REP INTERVENING COMPANY`, `REP CITY`, `REP COUNTRY`, `REP ESTIMATED KMS` | … REPRISE | non (sauf si `REP SAME AS DELIVERY` = non) |
| `INTERVENING COMPANY` | ENTREPRISE INTERVENANTE, PRESTATAIRE | non |
| `SCALES ASSIGNED` | BALANCES | non |
| `MANUTENTION PROVIDER` / `MANUTENTION PROVIDER OTHER` | PRESTATAIRE MANUTENTION | non |
| `SKIP MONTAGE` / `SKIP DEMONTAGE` | SANS MONTAGE / SANS DEMONTAGE | non |

**Règle RX** : 1 ligne de fichier = 1 accréditation = 1 véhicule = 1
catégorie. La ligne porte à la fois les informations de montage et de
démontage.

**Plaque RX** : `PLATE` reste **facultative** pour RX (jamais utilisée comme
clé de déduplication) ; `VEHICLE TYPE` est en revanche **obligatoire**.

**Plaque Palais** : `PLATE` est **obligatoire** pour le template Palais.

## 5. Statut d'import : PENDING vs VALIDATED

Le statut de l'accréditation créée n'est **jamais lu dans le fichier**
(colonne `STATUS` interdite). Il dépend uniquement du paramètre de requête
`importMode` :

| `importMode` | Statut créé | Rôle requis |
|---|---|---|
| `PENDING` (défaut) | `NOUVEAU` | permission d'import (`CREER` en écriture) |
| `VALIDATED` | `ATTENTE` (comme une création validée par le back-office) | **SUPER_ADMIN** uniquement (403 sinon) |

Dans les deux cas, `actorSource = CSV_IMPORT` est enregistré dans
l'historique de chaque accréditation créée.

## 6. Doublons et réimport

| Situation | Comportement |
|---|---|
| Même plaque sur plusieurs lignes | **Autorisé** (jamais bloquant) |
| RX sans plaque | **Autorisé**, jamais utilisé comme clé de déduplication |
| Deux lignes strictement identiques dans le même fichier | Avertissement `DUPLICATE_ROWS` au dry-run ; le commit exige `confirmDuplicates=true` |
| Même fichier (empreinte SHA-256 identique) déjà importé avec succès | Avertissement au dry-run ; le commit exige `confirmReimport=true`, réservé aux **SUPER_ADMIN** |

Aucune suppression automatique n'est jamais effectuée : une fois confirmées,
toutes les lignes (y compris les doublons) sont importées.

## 7. Dry-run et atomicité

- `commit=false` (défaut) : **dry-run** — parsing complet, résolution
  référentiel, validation par le moteur, agrégation des quotas du lot.
  Aucune écriture en base, aucun e-mail, aucun `ImportBatch` créé.
- `commit=true` : le lot entier est créé dans **une seule transaction** :
  soit toutes les lignes sont créées, soit **aucune** (rollback complet en
  cas d'échec d'une seule ligne, y compris un dépassement de quota détecté
  au moment précis du commit).

## 8. Comportement des e-mails

Les e-mails de création sont envoyés **uniquement après** le commit réussi
en base, **hors transaction**. Chaque accréditation créée déclenche une
tentative d'envoi ; un échec d'e-mail (SMTP, destinataire invalide…) **ne
remet jamais en cause** la création déjà enregistrée et ne transforme jamais
la réponse HTTP en échec — la réponse `201` distingue le résultat du lot en
base (`created`, `accreditationIds`) du résultat des e-mails
(`emailSummary.sent` / `failed` / `skippedNoRecipient` / `skippedDisabled`).

## 9. Modèles

- [`templates/accreditations-template.csv`](./templates/accreditations-template.csv)
  — en-têtes uniquement (à dupliquer et remplir).
- [`templates/accreditations-example.csv`](./templates/accreditations-example.csv)
  — un exemple Palais et un exemple RX (données fictives), avec commentaires
  expliquant les colonnes utilisées par chaque template.
