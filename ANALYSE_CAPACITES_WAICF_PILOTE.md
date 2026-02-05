# Analyse de conformité fonctionnelle – phase pilote WAICF

## Méthode
- Relecture des couches **données (Prisma)**, **API (Next route handlers)**, **écrans opérateur/logisticien**, et **navigation**.
- Vérification point par point contre le besoin fourni (périmètre véhicules, zones, traçabilité, contact chauffeur, coordination inter-zones).

## Verdict global
**L’application n’est pas capable de couvrir “parfaitement” le scénario de test décrit.**

Elle couvre une base utile (création d’accréditations, statuts, historisation, timestamps entrée/sortie), mais il manque plusieurs capacités critiques pour votre cahier de test :
1. absence de modèle explicite de **zone opérationnelle** (La Bocca / Palais / Carrefour),
2. absence de **workflow inter-zones** ("Envoyer vers Palais"),
3. absence de contact chauffeur en **appel/WhatsApp direct**,
4. typologie véhicule non alignée sur **Semi-remorque / Porteur**,
5. éléments de navigation affichés mais routes métier manquantes (zones, flux, dates),
6. module “temps réel” présent seulement sous forme de simulation.

---

## Détail par exigence

## 1) Périmètre véhicules (Semi-remorques + Porteurs uniquement)
### État observé
- Le modèle métier expose des types `PETIT|MOYEN|GRAND|TRES_GRAND` (enum `VehicleType`) et, côté formulaire principal, des tailles volumétriques (`-10`, `10-14`, `15-20`, `+20`).
- Aucune contrainte métier n’impose explicitement les 2 catégories “Semi-remorque” et “Porteur”.

### Conclusion
**Partiellement conforme / non conforme au cadrage pilote** : saisie véhicule possible, mais la taxonomie demandée n’est pas implémentée telle quelle.

## 2) Zones concernées (La Bocca + Palais Place centrale/Carrefour)
### État observé
- Le schéma `Accreditation` / `Vehicle` ne contient pas de champ structuré de zone active/courante.
- La navigation affiche des liens “Gestion zones”, “Flux véhicules”, “Gestion dates”, mais les pages correspondantes ne sont pas présentes dans `src/app/logisticien`.

### Conclusion
**Non conforme** : pas de gestion opérationnelle des zones demandées.

## 3) Enregistrement accréditation (données demandées)
### État observé
- Les écrans de création collectent bien entreprise, stand, déchargement, événement, plaque, téléphone, date, heure optionnelle, ville de départ, mode de déchargement.
- L’API de création valide les champs et stocke les véhicules.

### Limites
- Le `POST /api/accreditations` exige actuellement `v.time` (heure), alors que votre mode opératoire la décrit comme optionnelle.
- Le champ “société de déchargement” distinct n’est pas explicite : l’app a `unloading` au niveau accréditation (prestataire) et `unloading` au niveau véhicule (latéral/arrière), ce qui peut créer une ambiguïté métier.

### Conclusion
**Majoritairement couvert**, avec incohérence sur l’optionnalité de l’heure.

## 4) Entrée/sortie + traçabilité + temps passé en zone
### État observé
- Le statut peut passer à `ENTREE`/`SORTIE`.
- Les timestamps `entryAt` et `exitAt` sont automatiquement posés lors du `PATCH` statut.
- La durée est calculée côté UI à partir de `entryAt`/`exitAt`.
- Historique des modifications disponible via `AccreditationHistory` et API dédiée.

### Limites
- La durée calculée correspond à une présence globale, pas un **temps par zone** (puisqu’il n’y a pas de modèle de zones).
- Pas de scan effectivement implémenté (dans la navigation, “Scans” pointe vers `#`).

### Conclusion
**Couvert partiellement** (traçabilité globale oui, traçabilité multi-zones non).

## 5) Contact chauffeur (appel + WhatsApp)
### État observé
- Le numéro est stocké et affiché.
- Aucun lien/action `tel:` ni `wa.me` n’est implémenté dans les écrans principaux de suivi/édition.

### Conclusion
**Non conforme** : contact direct chauffeur non implémenté tel que requis.

## 6) Coordination inter-zones / régulation Palais
### État observé
- Les statuts existent mais ne sont pas modélisés par zone (ex: “En attente – La Bocca”, “En attente – Palais”).
- Aucun bouton métier de transfert type “Envoyer à → Palais”.
- Un composant `RealTimeNotifications` existe mais décrit explicitement une simulation (pas une vraie stack WS/SSE).

### Conclusion
**Non conforme** sur le workflow inter-zones en temps réel.

## 7) Robustesse / exploitation
### Observations
- Historisation structurée présente et utile pour audit.
- Fonction d’envoi d’accréditation par email (PDF) implémentée.
- Certaines sections produit semblent incomplètes (ex: page d’accueil encore template Next.js par défaut).

### Conclusion
Base exploitable pour pilote technique restreint, mais **pas prête pour valider entièrement le protocole opérationnel WAICF** décrit.

---

## Recommandation opérationnelle
Pour atteindre votre niveau “fait parfaitement” sur cette phase pilote, il faut prioriser :
1. **Modèle Zone** (zone courante + historique de mouvements par zone).
2. **Workflow transitions de zone** (Entrée/Sortie La Bocca, transfert vers Palais, Entrée/Sortie Palais).
3. **Contraintes véhicule pilote** (semi-remorque / porteur uniquement).
4. **Actions de contact immédiat** (`tel:` + WhatsApp).
5. **Scan réel** (QR/plaque) branché à la recherche/sélection d’accréditation.
6. **Routes manquantes** (zones/flux/dates) ou suppression des liens non fonctionnels.

Sans ces chantiers, la couverture reste partielle et ne permet pas de conclure à une conformité complète de votre fiche de test.
