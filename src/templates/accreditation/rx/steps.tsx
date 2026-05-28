"use client";

import type { StepDef } from "../types";
import type { RxFormData } from "./types";
import { StepExhibitorRx } from "./components/StepExhibitorRx";
import { StepContactRx } from "./components/StepContactRx";
import { StepDeliveryRx } from "./components/StepDeliveryRx";
import { StepPickupRx } from "./components/StepPickupRx";
import { StepManutentionRx } from "./components/StepManutentionRx";

/**
 * 5 steps RX alignés sur la maquette validée par Éric :
 *   1. Exposant     — combobox unique + auto-déduction espace (+ Int/Ext Palais)
 *   2. Contact      — coordonnées du demandeur
 *   3. Livraison    — catégories + dates + créneaux + N véhicules
 *   4. Reprise      — date + créneau pour chaque catégorie cochée au montage
 *   5. Manutention  — prestataire + validation finale + overlay succès
 */
export const rxSteps: StepDef<RxFormData>[] = [
  { id: "exhibitor", label: "Exposant", component: StepExhibitorRx },
  { id: "contact", label: "Contact", component: StepContactRx },
  { id: "delivery", label: "Livraison", component: StepDeliveryRx },
  { id: "pickup", label: "Reprise", component: StepPickupRx },
  { id: "manutention", label: "Manutention", component: StepManutentionRx },
];
