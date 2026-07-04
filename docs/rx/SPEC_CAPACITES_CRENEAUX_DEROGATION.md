Tu es sur le repo `Techtrust201/cannes-one-pass`.

Je veux que tu prennes ton temps et que tu implémentes proprement une grosse évolution RX autour de :

1. la gestion des capacités par zone / date / créneau ;
2. les dates et horaires spécifiques par stand via CSV ;
3. la différenciation poids légers / poids lourds ;
4. la logique de réservation provisoire / définitive selon les statuts ;
5. le mode dérogation logisticien ;
6. la correction du véhicule de reprise différent ;
7. l’affichage des instructions dans le résumé, le mail et le PDF ;
8. les templates CSV et email à transmettre à Mathieu.

Tu dois être extrêmement minutieux. Ne code pas vite. Ne crée pas de doublons inutiles. Ne recrée pas une logique qui existe déjà. Inspecte d’abord tout le code existant, les modèles Prisma, les helpers, les templates RX, les APIs existantes, les composants de formulaire, les générateurs PDF et email, puis seulement ensuite implémente.

Objectif : une implémentation propre, maintenable, multi-tenant, sans régression sur le Palais, sans casser le formulaire public RX, sans casser la création logisticien, sans casser les QR codes, sans casser les PDFs, sans casser le scan.

---

# Règles générales de travail

Avant de modifier quoi que ce soit :

1. Audite le code existant.
2. Identifie les modèles déjà présents dans `prisma/schema.prisma`.
3. Identifie les helpers déjà existants pour :

   * gabarits véhicule ;
   * poids lourd / poids léger ;
   * zones ;
   * événements ;
   * stands ;
   * accréditations ;
   * statuts ;
   * historique ;
   * PDF ;
   * email ;
   * RX template.
4. Ne crée pas un nouveau modèle si un modèle existant peut être étendu proprement.
5. Ne duplique pas les helpers de détection poids lourd / poids léger s’ils existent déjà.
6. Ne mets pas de logique métier uniquement côté front.
7. Toute règle critique doit être vérifiée côté API.
8. Toute logique de capacité doit être transactionnelle ou protégée contre les validations concurrentes.
9. Les règles RX doivent être scopées à l’organisation RX et ne doivent pas impacter les autres espaces.
10. Les noms, types et fonctions doivent être clairs.

À la fin :

* lance le lint ;
* lance le typecheck ;
* lance le build ;
* vérifie les migrations Prisma ;
* vérifie les pages RX concernées ;
* vérifie la création publique ;
* vérifie la création logisticien ;
* vérifie le mode dérogation ;
* vérifie le PDF ;
* vérifie l’email ;
* vérifie qu’il n’y a pas de doublons dans les véhicules, accréditations, QR codes ou créneaux.

---

# Contexte métier RX

Killian a demandé plusieurs évolutions.

## Demandes principales

### Gestion des dates par stand

Chaque stand peut avoir ses propres dates et horaires de montage / démontage.

Aujourd’hui, les exposants suivent globalement un planning commun, mais ce n’est pas assez précis.

Il faut permettre d’importer via CSV des règles spécifiques par stand :

* événement ;
* stand ;
* société ;
* lieu ;
* zone d’attente ;
* dates de montage ;
* horaires de montage ;
* dates de démontage ;
* horaires de démontage ;
* gabarits autorisés ;
* quotas / capacités ;
* commentaire.

Quand l’exposant sélectionne son stand, le formulaire RX doit proposer uniquement les dates et horaires autorisés pour ce stand.

### Capacité par zone / créneau

L’objectif est de limiter le nombre de véhicules pouvant être affectés à une zone, sur une date et un créneau donné.

Exemple :

```txt
Événement : RX / Cannes Yachting Festival
Zone : Zone 2 / Parking du Stade Coubertin
Date : 03/09/2026
Créneau : 10:00 - 11:00
Famille : Poids lourds
Capacité max : 12 véhicules
```

Si les 12 places sont déjà prises ou pré-réservées, le créneau ne doit plus être sélectionnable par les exposants.

### Différenciation poids légers / poids lourds

Les poids légers et les poids lourds ne suivent pas le même processus.

#### Poids légers

Gabarits concernés :

* VL ;
* 10 m³ ;
* 15 m³ ;
* 20 m³ ;
* tous les véhicules inférieurs ou égaux à 20 m³.

Processus métier attendu :

* création de l’accréditation ;
* orientation vers Zone 1 : Liégeard / Grand Parking de la Plage ;
* présentation au Palais ;
* déchargement ou stationnement temporaire d’une durée maximale de 2 heures ;
* pas besoin de demander les informations de déchargement lourd inutiles.

#### Poids lourds

Gabarits concernés :

* porteur ;
* porteur articulé ;
* semi-remorque ;
* tous les gabarits supérieurs.

Processus métier attendu :

* création de l’accréditation ;
* orientation vers Zone 2 : Parking du Stade Coubertin ;
* mise en attente sur l’aire de rétention ;
* contact de la personne réceptionnant la marchandise sur site ;
* présentation du réceptionnaire auprès du personnel logistique du Palais ;
* autorisation de départ vers le Palais ;
* présentation du véhicule au Palais.

Ces instructions doivent apparaître :

* dans le résumé de l’accréditation ;
* dans le mail ;
* dans le PDF ;
* idéalement dans l’interface de création lorsque le gabarit est choisi.

---

# Règle métier critique : réservation provisoire / définitive

Il faut implémenter exactement cette logique.

## Avant soumission du formulaire

Quand un exposant navigue dans le formulaire et sélectionne un créneau, cela ne réserve rien en base.

Aucune place ne doit être bloquée tant que la demande n’est pas envoyée.

## Après soumission publique

Quand l’exposant valide le formulaire public et qu’une accréditation est créée au statut `NOUVEAU`, le créneau doit être considéré comme une pré-réservation provisoire.

Cela signifie :

```txt
NOUVEAU = pré-réservation provisoire
```

Le créneau n’est pas encore définitivement validé par le logisticien, mais la place doit être temporairement comptabilisée dans les disponibilités pour éviter la survente.

Donc si la capacité est de 12 et qu’il y a :

* 10 accréditations `ATTENTE` ;
* 1 accréditation `NOUVEAU` ;
* 1 accréditation `ENTREE` ;

alors le créneau est complet.

## Refus

Si le logisticien refuse une accréditation `NOUVEAU`, la place doit redevenir disponible immédiatement dans tous les formulaires.

```txt
REFUS = libération de la place
```

## Validation logisticien

Quand le logisticien valide une accréditation `NOUVEAU`, elle passe en `ATTENTE`.

À partir de ce moment-là, la place est définitivement bloquée.

```txt
ATTENTE = réservation confirmée / définitive
```

Attention : lors du passage de `NOUVEAU` à `ATTENTE`, il ne faut pas compter deux fois la même accréditation. Il faut convertir la pré-réservation provisoire en réservation confirmée.

## Entrée en zone

Quand le véhicule entre en zone, le statut devient `ENTREE`.

```txt
ENTREE = véhicule physiquement présent / capacité occupée
```

Il continue à bloquer la place.

## Sortie de zone

Quand le véhicule sort de la zone, le statut devient `SORTIE`.

```txt
SORTIE = libération de la place
```

La place redevient disponible pour les calculs d’occupation et de disponibilité si le créneau / la logique métier le permet.

## Absent

```txt
ABSENT = libération de la place
```

## Résumé des statuts

```txt
NOUVEAU = pré-réservation provisoire
ATTENTE = réservation confirmée
ENTREE = occupation réelle de la zone
SORTIE = libéré
REFUS = libéré
ABSENT = libéré
```

---

# Important : affichage de la disponibilité

Le formulaire exposant doit afficher uniquement les créneaux encore disponibles.

Mais UX recommandée : ne pas forcément masquer totalement les créneaux pleins. Tu peux les désactiver avec une mention claire :

```txt
10:00 - 11:00 — Complet
```

ou :

```txt
10:00 - 11:00 — 0 place restante
```

Si un créneau a encore de la place :

```txt
10:00 - 11:00 — 3 places restantes
```

Si une partie des places est provisoire :

```txt
10:00 - 11:00 — 3 restantes, 2 demandes en attente de validation
```

Mais ne surcharge pas l’interface. Fais simple, propre et lisible.

---

# Protection contre les conflits concurrents

Il faut impérativement gérer le cas suivant :

1. Deux exposants ouvrent le formulaire en même temps.
2. Il reste une seule place sur le créneau.
3. Les deux voient le créneau disponible.
4. Les deux soumettent presque au même moment.

Résultat attendu :

* le premier passe ;
* le second doit être refusé côté API avec un message clair.

Message :

```txt
Ce créneau n’est plus disponible. Veuillez sélectionner un autre horaire.
```

Il faut donc faire une vérification côté serveur au moment exact de la création.

Utilise une transaction Prisma propre.

Si nécessaire, utilise une transaction avec isolation suffisante ou un verrou logique par clé :

```txt
organizationId + eventId + zone + date + slot + vehicleFamily + phase
```

Ne te contente pas d’un contrôle front.

---

# Modèle de données attendu

Inspecte d’abord le schéma existant.

Il existe déjà probablement :

* `Organization`
* `Event`
* `Stand`
* `Accreditation`
* `Vehicle`
* `ZoneConfig`
* `VehicleTypeConfig`
* `VehicleTimeSlot`
* historique accréditation
* extension JSON RX

Ne crée pas de doublon.

## Si aucun modèle équivalent n’existe

Créer ou étendre proprement les modèles nécessaires.

### Règles de stand / créneaux autorisés

Créer un modèle équivalent à :

```prisma
model StandAccessRule {
  id             String   @id @default(uuid())
  organizationId String
  eventId        String?
  standId        String?
  standNumber    String
  company        String?
  phase          String   // MONTAGE | DEMONTAGE
  date           DateTime @db.Date
  startTime      String   // HH:mm
  endTime        String   // HH:mm
  zone           String?
  vehicleFamily  String?  // LIGHT | HEAVY | ALL
  vehicleTypeCodes Json?
  quotaSlots     Int?
  comment        String?  @db.Text
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([organizationId])
  @@index([eventId])
  @@index([standNumber])
  @@index([date])
  @@index([zone])
}
```

Tu peux adapter le nom si un équivalent existe déjà, mais garde la logique.

### Capacités par zone / date / créneau

Créer un modèle équivalent à :

```prisma
model ZoneSlotCapacity {
  id             String   @id @default(uuid())
  organizationId String
  eventId        String?
  zone           String
  date           DateTime @db.Date
  startTime      String
  endTime        String
  vehicleFamily  String   // LIGHT | HEAVY | ALL
  phase          String?  // MONTAGE | DEMONTAGE | ALL
  capacity       Int
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([organizationId, eventId, zone, date, startTime, endTime, vehicleFamily, phase])
  @@index([organizationId])
  @@index([eventId])
  @@index([zone, date])
}
```

Adapte si nécessaire.

### Source de création / dérogation

Il faut tracer si une accréditation vient :

* du formulaire public ;
* d’une création logisticien ;
* d’une dérogation ;
* d’un import CSV.

Si un champ existe déjà, réutilise-le.

Sinon, ajoute une solution propre, par exemple :

```prisma
createdVia       String?  // PUBLIC_FORM | LOGISTICIEN | DEROGATION | CSV_IMPORT
isDerogation     Boolean  @default(false)
capacityBypass   Boolean  @default(false)
```

Si tu préfères stocker dans `extension` pour éviter trop de migration, fais-le seulement si c’est cohérent avec le code existant. Mais il faut que ce soit facilement exploitable dans l’historique, les filtres et les audits.

---

# Détection poids léger / poids lourd

Ne duplique pas la logique si elle existe.

Le repo semble déjà avoir une logique autour de `VehicleTypeConfig`, `pdfCode`, `isHeavy`, etc.

Règle attendue :

```txt
pdfCode C ou D = poids lourd
sinon = poids léger
```

Ou utilise le helper existant s’il y en a déjà un.

Il faut centraliser dans un helper unique, par exemple :

```ts
resolveVehicleFamily(vehicleTypeCode, vehicleTypes): "LIGHT" | "HEAVY"
```

ou réutiliser un helper existant.

À ne pas faire :

* ne pas coder `if label.includes("Semi")` partout ;
* ne pas dupliquer la logique dans chaque composant ;
* ne pas se baser uniquement sur le texte affiché ;
* ne pas casser les traductions.

---

# Zone d’attente selon famille véhicule

Pour RX, prévoir les règles par défaut :

```txt
LIGHT = Zone 1 / Liégeard / Grand Parking de la Plage
HEAVY = Zone 2 / Parking du Stade Coubertin
```

Mais ne hardcode pas de façon sale.

Priorité :

1. utiliser une configuration existante si elle existe ;
2. sinon créer une configuration propre ;
3. sinon ajouter un helper RX centralisé avec des constantes bien nommées.

Il faut permettre à terme de rendre cette logique administrable.

---

# Administration des processus

Créer une première version propre, même simple, permettant de définir ou préparer la personnalisation par famille / gabarit.

Objectif à terme :

Pour chaque famille ou type de véhicule, pouvoir configurer :

* zone d’attente associée ;
* message affiché au chauffeur ;
* instructions logistiques ;
* étapes du processus ;
* informations demandées dans le formulaire ;
* durée maximale de stationnement ;
* capacité par créneau ;
* possibilité ou non de dépassement en dérogation.

Si l’administration complète est trop large pour être faite en une seule passe, implémente au minimum :

1. un modèle ou une configuration centralisée ;
2. des valeurs par défaut RX ;
3. une structure claire permettant de brancher l’UI admin ensuite ;
4. aucune duplication de texte dans 10 fichiers différents.

---

# CSV — Import dates / horaires / capacités

Il faut prévoir un système CSV pour injecter les règles par stand.

## Colonnes attendues

Template CSV recommandé :

```csv
evenement,stand,societe,lieu,zone_attente,phase,date_debut,date_fin,horaire_debut,horaire_fin,famille_vehicule,gabarits_autorises,capacite_creneau,quota_slots,commentaire
```

Tu peux aussi conserver la version plus détaillée si elle s’intègre mieux :

```csv
evenement,stand,societe,lieu,zone_attente,date_montage_debut,date_montage_fin,horaire_montage_debut,horaire_montage_fin,date_demontage_debut,date_demontage_fin,horaire_demontage_debut,horaire_demontage_fin,gabarits_autorises,quota_slots,commentaire
```

Choisis la structure la plus maintenable.

## Import attendu

L’import CSV doit :

* parser proprement le fichier ;
* valider les colonnes ;
* valider les dates ;
* valider les horaires ;
* valider l’événement ;
* valider le stand si possible ;
* valider la zone ;
* valider la famille véhicule ;
* valider les gabarits ;
* créer ou mettre à jour les règles ;
* éviter les doublons ;
* retourner un rapport clair.

## Rapport d’import

Retourner :

```txt
X lignes importées
Y lignes mises à jour
Z lignes ignorées
Erreurs :
- ligne 4 : date invalide
- ligne 8 : zone inconnue
```

## Upsert

L’import doit être idempotent.

Importer deux fois le même CSV ne doit pas créer de doublons.

Clé logique recommandée :

```txt
organizationId + eventId + stand + phase + date + horaire_debut + horaire_fin + zone + famille_vehicule
```

---

# Templates à fournir à Mathieu

Créer des fichiers propres dans le repo, par exemple :

```txt
docs/rx/template-mail-exposant.md
docs/rx/template-csv-stands-creneaux.md
public/templates/rx-stands-creneaux-template.csv
public/templates/rx-stands-creneaux-example.csv
```

Adapte selon la structure existante.

## Template mail exposant

Documenter :

* objet ;
* corps ;
* variables ;
* QR code ;
* PDF joint ;
* message selon statut ;
* différence demande publique / accréditation validée.

Variables à documenter :

```txt
{{societe}}
{{stand}}
{{evenement}}
{{vehicule}}
{{gabarit}}
{{plaque}}
{{remorque}}
{{date}}
{{horaire}}
{{ville_depart}}
{{telephone_chauffeur}}
{{email_chauffeur}}
{{qr_code}}
```

## Template CSV

Documenter chaque colonne.

Fournir :

* un fichier vide ;
* un fichier exemple ;
* une explication lisible.

---

# Formulaire RX — Disponibilité des créneaux

Actuellement, le formulaire RX propose des dates et des créneaux selon le planning.

Il faut ajouter la notion de disponibilité.

## Comportement attendu

Quand l’utilisateur sélectionne :

* son événement ;
* son stand ;
* son gabarit ;
* sa phase : montage / démontage ;
* sa catégorie si nécessaire ;

alors l’interface doit charger les créneaux autorisés et disponibles.

## Ordre logique

Le gabarit doit être demandé suffisamment tôt pour déterminer :

* famille véhicule : LIGHT / HEAVY ;
* zone d’attente ;
* processus à afficher ;
* disponibilité du créneau ;
* champs à demander.

Si le formulaire existant demande déjà le gabarit au niveau du véhicule, adapte sans casser le flux.

Le but n’est pas forcément de tout refaire visuellement, mais il faut que la disponibilité puisse être calculée avant le choix final du créneau.

## Multi-véhicules

Attention : une demande peut contenir plusieurs véhicules.

Chaque véhicule doit consommer une place.

Si une catégorie contient 3 véhicules sur le même créneau, il faut vérifier qu’il reste 3 places, pas seulement 1.

Si les véhicules sont de familles différentes, le calcul doit être fait famille par famille.

---

# API disponibilité

Créer ou adapter une API propre pour récupérer les disponibilités.

Exemple :

```txt
GET /api/rx/slots/availability?organizationId=...&eventId=...&stand=...&phase=MONTAGE&vehicleFamily=HEAVY&zone=...&date=...
```

Ou un endpoint plus générique si le projet est déjà organisé autrement :

```txt
GET /api/accreditations/slots/availability
```

Réponse attendue :

```ts
type SlotAvailability = {
  date: string;
  startTime: string;
  endTime: string;
  zone: string;
  vehicleFamily: "LIGHT" | "HEAVY";
  phase: "MONTAGE" | "DEMONTAGE";
  capacity: number;
  provisionalUsed: number;
  confirmedUsed: number;
  inZoneUsed: number;
  remaining: number;
  isFull: boolean;
};
```

Définition :

```txt
provisionalUsed = accréditations NOUVEAU
confirmedUsed = accréditations ATTENTE
inZoneUsed = accréditations ENTREE
remaining = capacity - provisionalUsed - confirmedUsed - inZoneUsed
```

Les statuts `REFUS`, `ABSENT`, `SORTIE` ne doivent pas consommer de place.

Attention à ne pas compter deux fois une accréditation.

---

# API création accréditation

Lors de la création d’une accréditation publique RX :

1. recevoir les véhicules ;
2. déterminer pour chaque véhicule :

   * phase ;
   * date ;
   * créneau ;
   * zone ;
   * famille véhicule ;
3. vérifier la capacité restante ;
4. si insuffisant :

   * refuser la création ;
   * retourner un message clair ;
5. sinon :

   * créer l’accréditation ;
   * créer les véhicules ;
   * stocker les infos de créneau ;
   * statut `NOUVEAU` pour formulaire public ;
   * créer l’historique.

## Important

À la soumission publique :

```txt
NOUVEAU = pré-réservation provisoire
```

La place doit être comptée dans les disponibilités après création.

---

# Validation logisticien

Lorsqu’un logisticien valide une accréditation `NOUVEAU` :

* statut devient `ATTENTE` ;
* la pré-réservation devient réservation confirmée ;
* ne pas consommer une place supplémentaire ;
* ne pas double-compter ;
* vérifier proprement la capacité en excluant l’accréditation courante du calcul si nécessaire.

Si la capacité a été modifiée entre temps et que le créneau est maintenant incohérent :

* ne pas planter ;
* soit autoriser la validation car la pré-réservation existait déjà ;
* soit afficher un warning et demander une validation en dérogation.

Choisis l’approche la plus cohérente avec le code, mais ne laisse pas une situation silencieuse incohérente.

Recommandation :

* si l’accréditation était déjà en `NOUVEAU` et comptée en provisoire, autoriser le passage `ATTENTE` ;
* tracer la conversion provisoire → confirmée dans l’historique ;
* si dépassement anormal dû à changement de capacité admin, tracer un warning.

---

# Refus logisticien

Lorsqu’un logisticien refuse une accréditation :

* statut devient `REFUS` ;
* la place redevient disponible ;
* la disponibilité des formulaires doit se mettre à jour ;
* historique clair.

---

# Entrée / sortie zone

Lorsqu’un véhicule entre :

```txt
ENTREE = occupe réellement une place
```

Lorsqu’un véhicule sort :

```txt
SORTIE = libère la place
```

Vérifie que la logique de scan et de changement de statut met bien à jour les disponibilités.

Attention : ne pas casser les mouvements de zone existants.

---

# Dérogation logisticien

Le mode dérogation doit bypasser :

* dates de stand ;
* horaires autorisés ;
* capacité ;
* quotas ;
* slots ;
* restrictions du formulaire public.

Mais il doit rester tracé.

## Accès

Ajouter un accès clair :

```txt
Créer une dérogation
```

Possible :

```txt
/logisticien/derogation?espace=rx
```

ou :

```txt
/logisticien/nouveau?espace=rx&mode=derogation
```

Choisis l’intégration la plus propre avec le routing existant.

## UX

Ne fais pas juste un énorme bloc “Dérogation” posé dans l’écran.

Il faut un vrai mode.

Afficher plutôt :

* titre : “Créer une dérogation” ;
* badge discret : “Mode dérogation” ;
* bandeau d’aide :
  “Ce mode permet au service logistique de créer une accréditation sans appliquer les contraintes du formulaire exposant.”

## Création

Une accréditation créée en dérogation :

* doit être créée normalement ;
* doit générer QR code ;
* doit générer PDF ;
* doit être scannable ;
* doit apparaître dans la liste ;
* doit conserver toutes les fonctionnalités habituelles ;
* doit être en statut `ATTENTE` par défaut ;
* doit avoir `createdVia = DEROGATION` ou équivalent ;
* doit avoir `isDerogation = true` ou équivalent ;
* doit avoir `capacityBypass = true` si le créneau était plein ou si la capacité n’a pas été vérifiée.

## Historique

Ajouter une entrée :

```txt
Accréditation créée en mode dérogation par [utilisateur].
```

Si capacité dépassée :

```txt
Capacité dépassée en mode dérogation : création autorisée par [utilisateur].
```

---

# Correction bug véhicule de reprise différent

Killian a remonté un bug :

Quand le véhicule de reprise est différent du véhicule de montage :

* il n’est pas correctement enregistré ;
* il n’apparaît pas correctement dans le PDF ;
* aucune fiche spécifique n’est générée ;
* aucun QR code spécifique n’est créé.

## Attendu

Chaque véhicule renseigné doit être correctement enregistré.

Si le véhicule de montage et le véhicule de démontage sont différents :

* conserver les informations du véhicule de montage ;
* conserver les informations du véhicule de reprise ;
* générer les fiches nécessaires ;
* générer les QR codes nécessaires ;
* tracer correctement les deux phases ;
* ne pas écraser le véhicule de montage avec le véhicule de reprise ;
* ne pas perdre le téléphone / chauffeur / gabarit / plaque de reprise.

## Évolution souhaitée

À terme, l’idéal est :

```txt
1 accréditation par véhicule
avec onglet Montage
et onglet Démontage
```

Si l’un des deux n’est pas renseigné, masquer l’onglet correspondant.

Mais priorité immédiate :

```txt
Aucun véhicule renseigné ne doit être perdu.
Chaque véhicule doit avoir son QR code et sa fiche.
```

---

# Message sur documents générés

Ajouter en haut des documents générés un message visible :

```txt
DEMANDE VALIDÉE
Cette accréditation ne donne pas accès au site.
```

Attention : le wording exact pourra être validé avec Mathieu / Killian.

L’objectif est d’éviter qu’un exposant ou chauffeur pense que le document vaut autorisation d’accès définitive.

Il faut le mettre proprement :

* visible ;
* lisible ;
* pas énorme ;
* pas destructeur pour la mise en page ;
* cohérent dans PDF / mail si concerné.

---

# Résumé / mail / PDF — Instructions par famille véhicule

Quand le gabarit est connu, afficher les instructions adaptées.

## Pour poids légers

Texte recommandé :

```txt
Processus poids léger :
Votre véhicule doit se présenter en Zone 1 — Liégeard / Grand Parking de la Plage.
Après enregistrement, il pourra se présenter au Palais pour un déchargement ou un stationnement temporaire d’une durée maximale de 2 heures.
```

## Pour poids lourds

Texte recommandé :

```txt
Processus poids lourd :
Votre véhicule doit se présenter en Zone 2 — Parking du Stade Coubertin.
Il sera mis en attente sur l’aire de rétention. La personne réceptionnant la marchandise devra être contactée et se présenter auprès du personnel logistique du Palais avant autorisation de départ vers le Palais.
```

Ces textes doivent être centralisés, pas copiés-collés partout.

Si l’i18n existe pour RX, intégrer proprement dans les traductions.

---

# Bilan carbone / comptage / liste

Ne casse pas les écrans existants.

La différenciation LIGHT / HEAVY doit rester cohérente avec :

* la liste des accréditations ;
* les filtres ;
* le comptage Flux véhicules ;
* le bilan carbone ;
* les PDFs.

Si des filtres existent déjà pour les gabarits ou les poids lourds, réutilise-les.

---

# Scroll infini / version PC

Killian a aussi demandé une optimisation version PC :

* éviter une pagination contraignante ;
* permettre de parcourir beaucoup d’accréditations ;
* option scroll infini ou chargement progressif.

À ne faire que si ce n’est pas déjà proprement fait.

Règles :

* ne pas charger toute la base d’un coup ;
* garder les filtres ;
* garder le tri ;
* éviter les doublons ;
* conserver la pagination existante si utile ;
* permettre une préférence utilisateur entre pagination et scroll continu.

---

# Tests indispensables

Créer ou adapter des tests si la structure du repo le permet.

## Tests métier capacité

Cas 1 :

* capacité 2 ;
* créer 1 accréditation `NOUVEAU` ;
* disponibilité restante = 1.

Cas 2 :

* capacité 2 ;
* créer 2 accréditations `NOUVEAU` ;
* disponibilité restante = 0 ;
* le créneau est complet.

Cas 3 :

* capacité 2 ;
* créer 2 accréditations `NOUVEAU` ;
* refuser l’une ;
* disponibilité restante = 1.

Cas 4 :

* capacité 2 ;
* créer 1 accréditation `NOUVEAU` ;
* valider en `ATTENTE` ;
* disponibilité restante ne change pas ;
* pas de double comptage.

Cas 5 :

* capacité 2 ;
* créer 1 `ATTENTE` ;
* passer en `ENTREE` ;
* disponibilité restante ne double-compte pas.

Cas 6 :

* passer en `SORTIE` ;
* la place est libérée.

Cas 7 :

* mode dérogation sur créneau plein ;
* création autorisée ;
* historique indique le bypass.

## Tests poids léger / poids lourd

* VL = LIGHT ;
* 10 m³ = LIGHT ;
* 15 m³ = LIGHT ;
* 20 m³ = LIGHT ;
* Porteur = HEAVY ;
* Porteur articulé = HEAVY ;
* Semi-remorque = HEAVY.

Utiliser le helper centralisé basé sur la config existante, pas des strings hardcodées partout.

## Tests véhicule reprise différent

* montage véhicule A ;
* démontage véhicule B ;
* vérifier que A et B existent ;
* vérifier que B apparaît dans le PDF ;
* vérifier que chaque véhicule a un QR / fiche selon la logique du projet ;
* vérifier que la reprise n’écrase pas le montage.

---

# APIs et erreurs

Toutes les erreurs doivent être lisibles.

Exemples :

```txt
Ce créneau n’est plus disponible. Veuillez sélectionner un autre horaire.
```

```txt
Aucune règle horaire n’est configurée pour ce stand.
```

```txt
La zone associée au créneau est inconnue.
```

```txt
Le gabarit sélectionné ne permet pas de déterminer le processus logistique.
```

Ne pas exposer d’erreurs techniques Prisma côté utilisateur.

Logger proprement côté serveur.

---

# Contraintes de qualité

Ne fais pas :

* de logique métier dupliquée ;
* de gros composants illisibles ;
* de `any` partout ;
* de hardcode dispersé ;
* de migrations inutiles ;
* de champs inutilisés ;
* de modèles en double ;
* de fonctions mortes ;
* de faux mode dérogation uniquement visuel ;
* de contrôle de capacité uniquement côté front ;
* de chargement de toutes les accréditations en mémoire côté client ;
* de modification qui casse le Palais.

Fais :

* helpers purs ;
* services métier côté serveur ;
* types propres ;
* validation serveur ;
* transaction ;
* historique ;
* logs utiles ;
* UI propre ;
* code lisible ;
* séparation RX / multi-tenant ;
* tests ou au minimum scripts de vérification.

---

# Plan d’implémentation recommandé

## Étape 0 — Audit

Cherche et lis les fichiers liés à :

```txt
prisma/schema.prisma
src/app/api/accreditations
src/app/api/events
src/app/api/zones
src/app/api/vehicle-types
src/templates/accreditation/rx
src/components/accreditation
src/lib/accreditations-dashboard
src/lib/vehicle-type-server
src/lib/vehicle-type-resolve
src/lib/accreditation-pdf*
src/lib/accreditation-creation-email
src/lib/history*
```

Fais une courte synthèse interne avant de coder.

## Étape 1 — Helpers métier

Créer / adapter des helpers pour :

* `resolveVehicleFamily`
* `isCapacityConsumingStatus`
* `isProvisionalCapacityStatus`
* `isConfirmedCapacityStatus`
* `isReleasedCapacityStatus`
* `buildSlotKey`
* `computeSlotAvailability`
* `assertSlotCapacityAvailable`
* `getRxVehicleProcessInstructions`

## Étape 2 — Modèle données

Ajouter seulement les modèles/champs nécessaires.

Créer migration Prisma propre.

Vérifier que les index empêchent les doublons logiques.

## Étape 3 — CSV

Implémenter :

* template CSV vide ;
* CSV exemple ;
* documentation ;
* import ;
* validation ;
* rapport ;
* upsert idempotent.

## Étape 4 — Disponibilité créneaux

Implémenter l’API de disponibilité.

La brancher au formulaire RX.

Désactiver les créneaux pleins.

Afficher les places restantes.

## Étape 5 — Création / validation serveur

Brancher le contrôle capacité dans :

* création publique RX ;
* validation logisticien ;
* refus logisticien ;
* dérogation.

## Étape 6 — Dérogation

Créer un vrai mode dérogation.

Pas juste un label.

Bypass front + serveur.

Historique.

Statut `ATTENTE`.

QR/PDF OK.

## Étape 7 — Poids léger / lourd

Demander le gabarit suffisamment tôt.

Orienter zone et processus.

Afficher instructions dans résumé / mail / PDF.

## Étape 8 — Bug reprise différente

Corriger stockage, PDF, QR, fiche.

Vérifier aucun écrasement.

## Étape 9 — Tests / vérifications

Lancer :

```bash
npm run lint
npm run typecheck
npm run build
```

Si les scripts exacts diffèrent, utilise ceux du `package.json`.

Vérifier Prisma :

```bash
npx prisma validate
npx prisma generate
```

Ne lance pas de commande destructive.

---

# Critères d’acceptation finaux

La tâche est terminée uniquement si :

* les règles de dates / horaires par stand existent ;
* le CSV d’import est disponible ;
* l’import CSV est idempotent ;
* les capacités par zone / date / créneau / famille sont configurables ;
* les créneaux pleins sont désactivés ou non proposés ;
* la création publique vérifie la capacité côté API ;
* `NOUVEAU` crée une pré-réservation provisoire ;
* `REFUS` libère la place ;
* `ATTENTE` confirme définitivement la réservation ;
* `ENTREE` occupe la zone ;
* `SORTIE` libère la place ;
* il n’y a pas de double comptage lors de `NOUVEAU -> ATTENTE` ;
* le mode dérogation peut créer même si le créneau est plein ;
* le bypass est tracé ;
* les poids légers et poids lourds sont différenciés ;
* les instructions adaptées apparaissent dans résumé / mail / PDF ;
* le véhicule de reprise différent est correctement enregistré ;
* chaque véhicule nécessaire dispose de sa fiche / QR selon la logique projet ;
* les templates Mathieu sont créés ;
* aucun comportement Palais n’est cassé ;
* le build passe ;
* le lint passe ;
* le typecheck passe.

Travaille proprement, prends ton temps, vérifie chaque étape, et ne considère pas la tâche terminée tant que tout n’est pas cohérent de bout en bout.
