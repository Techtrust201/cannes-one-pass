"use client";

import type { StepDef } from "../types";
import type { RxFormData } from "./types";
import { StepOneRx } from "./components/StepOneRx";
import { StepTwoRx } from "./components/StepTwoRx";
import { StepThreeRx } from "./components/StepThreeRx";
import { StepFourRx } from "./components/StepFourRx";

export const rxSteps: StepDef<RxFormData>[] = [
  { id: "identification", label: "Identification", component: StepOneRx },
  { id: "delivery", label: "Livraison & véhicules", component: StepTwoRx },
  { id: "pickup", label: "Reprise & manutention", component: StepThreeRx },
  { id: "recap", label: "Récapitulatif", component: StepFourRx },
];
