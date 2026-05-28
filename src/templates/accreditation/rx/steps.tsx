"use client";

import type { StepDef } from "../types";
import type { RxFormData } from "./types";
import { StepExhibitorRx } from "./components/StepExhibitorRx";
import { StepContactRx } from "./components/StepContactRx";
import { StepDeliveryRx } from "./components/StepDeliveryRx";
import { StepPickupRx } from "./components/StepPickupRx";
import { StepManutentionRx } from "./components/StepManutentionRx";

/**
 * 5 étapes RX alignées sur la maquette validée :
 * Exposant / Contact / Livraison / Reprise / Manutention.
 * La tram visuelle (header, image, progress bar, langue, footer) provient
 * du wizard générique commun au Palais — seul le contenu diffère.
 */
export const rxSteps: StepDef<RxFormData>[] = [
  { id: "exhibitor", label: "Exposant", component: StepExhibitorRx },
  { id: "contact", label: "Contact", component: StepContactRx },
  { id: "delivery", label: "Livraison", component: StepDeliveryRx },
  { id: "pickup", label: "Reprise", component: StepPickupRx },
  { id: "manutention", label: "Manutention", component: StepManutentionRx },
];
