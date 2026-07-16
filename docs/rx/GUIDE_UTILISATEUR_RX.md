# Guide utilisateur RX — Cannes One Pass

Ce guide explique le fonctionnement **avec des mots simples**.
Il s’adresse aux équipes logistiques RX (pas aux développeurs).

---

## À quoi sert Cannes One Pass ?

Cannes One Pass permet de :

1. savoir **qui** peut accéder au site (exposant / emplacement) ;
2. savoir **quand** (planning et créneaux) ;
3. savoir **combien** de véhicules peuvent venir (quotas) ;
4. créer une **demande** ou une **accréditation** ;
5. générer un **PDF** et des **QR codes** ;
6. **scanner** les véhicules à l’entrée / sortie.

> **Important** : une demande publique non validée **ne permet pas** l’accès au site.
> Seule une accréditation validée (ou une validation terrain) autorise l’entrée.

---

## Les mots à connaître

### Exposant
La société qui expose (ex. HONDA MARINE).

### Emplacement
Le stand ou l’endroit précis de l’exposant (ex. POWER 215).
Deux emplacements du même secteur peuvent avoir des horaires différents.

### Planning
Les dates et horaires autorisés pour un emplacement (ou un secteur / port / événement).
Priorité : **emplacement → espace → secteur → port → événement**.

### Créneau
Une plage horaire précise (ex. 08:00–10:00).

### Quota / capacité
Le nombre maximum de véhicules autorisés sur un créneau (par famille LIGHT ou HEAVY).
Si aucun quota n’est configuré → **illimité**.

### LIGHT / HEAVY
- **LIGHT** : véhicule léger (consignes Zone 1, durée limitée).
- **HEAVY** : poids lourd (consignes Zone 2, réceptionnaire).

### Montage / Démontage
- **Montage** : livraison / installation.
- **Démontage** : reprise.
Un même véhicule peut faire les deux (**BOTH**), ou deux véhicules différents.

### Accréditation
Le dossier officiel d’accès (PDF + QR).

### Demande
Une création publique encore en statut **NOUVEAU** (non validée).

### Dérogation
Création par un logisticien **hors règles habituelles** (planning / gabarit / capacité), avec motif obligatoire et historique.

### QR
Code scanné sur le terrain. Chaque véhicule physique a son propre QR (Montage / Démontage).

### Centre d’import
Écran pour importer des fichiers (exposants, planning, règles par emplacement, capacités, etc.).

---

## Les statuts (dans l’ordre simple)

| Statut | Signification |
|--------|----------------|
| **NOUVEAU** | Demande reçue, pas encore validée → **pas d’accès** |
| **ATTENTE** | Validée / attendue sur site |
| **ENTREE** | Véhicule entré en zone |
| **SORTIE** | Véhicule sorti |
| **REFUS** | Accès refusé |
| **ABSENT** | Marqué absent |

---

## Procédures pas à pas

### 1. Gérer un exposant
1. Ouvrir **Paramétrage RX → Exposants & emplacements**.
2. Rechercher l’exposant.
3. Vérifier le nom et les emplacements.

### 2. Ajouter un emplacement
1. Ouvrir l’exposant.
2. Ajouter un emplacement (type + code, ex. FLOT / POWER 215).
3. Renseigner port / secteur / espace si connus.

### 3. Créer une règle LOCATION (horaire propre à l’emplacement)
1. Aller dans **Planning & quotas**.
2. Choisir l’événement.
3. Créer une règle de portée **emplacement**.
4. Renseigner phase, date, horaires.
5. Optionnel : zone d’attente, gabarits autorisés, commentaire.

> Sans règle propre, le système peut utiliser une règle plus large (secteur, etc.).

### 4. Autoriser des gabarits
Dans la règle d’emplacement, indiquer les codes autorisés (ex. `VL|10M3`).
Liste vide = **tous** les gabarits autorisés.

### 5. Créer des quotas
1. Onglet **Quotas** dans Planning & quotas.
2. Partir des horaires du planning.
3. Découper en créneaux (15 / 30 / 60 / 120 min).
4. Saisir LIGHT et HEAVY **réels** (ne pas inventer).
5. Confirmer la création.

### 6. Créer une demande (formulaire public ou logisticien)
1. Choisir exposant + emplacement.
2. Choisir créneau **disponible** (les créneaux complets sont grisés).
3. Choisir gabarit → les consignes LIGHT/HEAVY s’affichent.
4. Renseigner reprise (même véhicule ou différent).
5. Valider.

### 7. Créer une Dérogation
1. Menu **Paramétrage RX → Créer une dérogation**
   (ou bouton depuis « Nouveau » RX).
2. Remplir le motif (≥ 10 caractères).
3. Créer l’accréditation (statut **ATTENTE**).
4. Vérifier le badge **Dérogation** et l’historique.

> Une personne sans permission ne peut pas forcer un bypass capacité.

### 8. Gérer deux véhicules différents (montage ≠ reprise)
1. Dans le formulaire, indiquer que le véhicule de reprise est **différent**.
2. Renseigner gabarit / plaque / téléphone de chaque véhicule.
3. Après création : **2 véhicules** en base, **2 pages PDF**, **2 QR**, **2 blocs e-mail**.
4. Au scan : le QR Montage agit sur le véhicule Montage uniquement.

### 9. Utiliser le scanner
1. Choisir la **zone de poste**.
2. Scanner le QR (ou la plaque).
3. Vérifier société, emplacement, rôle, plaque, créneau.
4. Valider Entrée / Sortie.
5. Rescanner le second véhicule si besoin — actions indépendantes.

### 10. Importer un fichier
1. Ouvrir le **Centre d’import**.
2. Choisir la carte adaptée (ex. **Règles par stand / emplacement**).
3. Télécharger le modèle / l’exemple.
4. Faire un **dry-run**.
5. Corriger les erreurs.
6. Committer uniquement si le résultat est propre.

### 11. Corriger une erreur
- Lire le message (exposant ambigu, zone inconnue, gabarit inconnu…).
- Corriger le fichier ou la donnée en base.
- Relancer le dry-run.
- Ne jamais « forcer » en production sans comprendre l’erreur.

### 12. Modifier les consignes LIGHT / HEAVY
1. **Planning & quotas → Processus véhicules**.
2. Ajuster zone, durée, réceptionnaire, textes.
3. Enregistrer.
4. Vérifier formulaire, récap, e-mail et PDF (même source).

---

## Avertissements visibles

- Ne jamais inventer les capacités métier : RX doit fournir les chiffres.
- Mode planning actuel : **TRANSITION** (ne pas passer en STRICT sans validation).
- Ne pas supprimer massivement exposants / emplacements.
- Les anciens QR (sans `vehicleId`) restent acceptés.
- Palais ne doit **jamais** afficher les écrans Paramétrage RX.

---

## Où trouver l’aide ?

- Ce guide : `docs/rx/GUIDE_UTILISATEUR_RX.md`
- Modèle mail : `docs/rx/template-mail-exposant.md`
- Modèle règles stands : `docs/rx/template-regles-stands-emplacements.md`
- Fichiers CSV : `public/templates/`
