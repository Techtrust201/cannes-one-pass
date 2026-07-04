# RX — contrat métier capacité / créneaux

## Statuts et disponibilité

NOUVEAU = pré-réservation provisoire.
ATTENTE = réservation confirmée.
ENTREE = occupation réelle de la zone.
SORTIE = libéré.
REFUS = libéré.
ABSENT = libéré.

Les statuts qui consomment une place sont :
- NOUVEAU ;
- ATTENTE ;
- ENTREE.

Les statuts qui libèrent une place sont :
- SORTIE ;
- REFUS ;
- ABSENT.

NOUVEAU ne bloque pas définitivement le créneau : il pré-réserve une place jusqu’à validation ou refus.
NOUVEAU -> ATTENTE confirme la réservation sans double comptage.
REFUS rend la place disponible immédiatement dans tous les formulaires.
SORTIE rend la place disponible après départ de la zone.

## Familles véhicule

La source de vérité doit être la configuration véhicule existante.
Si possible, utiliser VehicleTypeConfig / pdfCode.

Règle attendue :
- pdfCode C ou D = HEAVY ;
- sinon = LIGHT.

Fallback métier RX :
- LIGHT = VL, 10 m³, 15 m³, 20 m³ ;
- HEAVY = Porteur, Porteur articulé, Semi-remorque.

Ne pas dupliquer cette logique dans plusieurs composants.
Créer ou réutiliser un helper centralisé.

## Capacité

La capacité se calcule par clé logique :

organizationId + eventId + zone + date + startTime + endTime + vehicleFamily + phase

phase = MONTAGE ou DEMONTAGE.

remaining = capacity - NOUVEAU - ATTENTE - ENTREE.

REFUS, ABSENT et SORTIE ne doivent pas être comptés.

Le front peut afficher les places restantes, mais le contrôle final doit être fait côté API.

## Dérogation

Dérogation = bypass dates, horaires, slots, quotas, capacité.
Mais la traçabilité est obligatoire.

Une dérogation créée par un logisticien doit être en ATTENTE par défaut.
Elle doit générer QR code, PDF, historique et rester scannable comme les autres.

## Contraintes projet

Ne pas casser le Palais.
Les règles RX doivent rester scopées à RX.
Ne pas créer de doublons si un modèle ou helper existe déjà.
Avant grosse modification : lister les fichiers concernés.
Ouvrir maximum 8 fichiers avant validation humaine.


Résumé de passation — capacité RX
Fichiers clés : docs/rx/RX_CAPACITY_CONTRACT.md (contrat), prisma/schema.prisma, src/templates/accreditation/rx/planning-data.ts + config.ts (genSlots), scripts/import-rx-planning.ts, src/lib/accreditations-dashboard.ts, src/lib/vehicle-type-defaults.ts, src/lib/vehicle-utils.ts, src/lib/rx-zone-rules.ts, formulaire RX (StepDeliveryRx, StepPickupRx, mapPayload.ts).
Capacité absente aujourd’hui : pas de modèle quota, pas d’API remaining, pas de flux dérogation repéré dans le code.
Helpers existants : vehicleIsHeavy / isHeavy(pdfCode C|D) dans accreditations-dashboard.ts ; doublon dans org-filter-options.ts ; résolution gabarit via vehicle-type-resolve.ts + vehicle-utils.ts ; créneaux horaires via genSlots ; planning dates/plages via RX_PLANNING ; zones via suggestZone / buildRxZoneRouting.
Modèles Prisma utiles : Accreditation (statuts NOUVEAU/ATTENTE/ENTREE/SORTIE/REFUS/ABSENT, extension JSON), Vehicle (vehicleType, date, time), VehicleTypeConfig (pdfCode, routage RX), VehicleTimeSlot (scan zone réelle — ≠ quota créneau), Event, Organization, ZoneConfig.
APIs concernées : POST /api/accreditations (création, sans contrôle capacité), PATCH /api/accreditations/[id] (transitions statut), GET /api/accreditations/stats et dashboard (comptage dashboard, pas capacité créneau), GET /api/vehicle-types.
Risques à traiter tôt : centraliser HEAVY/LIGHT (doublon isHeavy), trancher pdfCode vs fallback gabarit (15/20 m³), ne pas confondre VehicleTimeSlot et quota planning.
Prochaine phase recommandée (Phase 1–2) : modèle Prisma capacité par clé logique (organizationId + eventId + zone + date + startTime + endTime + vehicleFamily + phase), helper central rx-capacity (famille, comptage consommateurs, remaining), puis validation API POST/PATCH scopée RX — sans toucher le front ni le Palais.