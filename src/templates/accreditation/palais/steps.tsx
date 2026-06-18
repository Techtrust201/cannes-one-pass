"use client";

import StepOne from "@/components/accreditation/StepOne";
import StepTwo from "@/components/accreditation/StepTwo";
import StepThree from "@/components/accreditation/StepThree";
import StepFour from "@/components/accreditation/StepFour";
import type { Vehicle } from "@/types";
import type { StepProps, StepDef } from "../types";
import type { PalaisFormData } from "./types";
import { useStepFourContext } from "./stepFourContext";

/**
 * Wrappers fins qui exposent les steps Palais existants via l'interface
 * `StepProps<PalaisFormData>` du moteur de templates. Les composants
 * d'origine ne sont pas modifiés — chaque wrapper se contente de router
 * la slice `data` adéquate vers le composant historique.
 */

function PalaisStepOne({ data, update, onValidityChange, orgSlug, showErrors }: StepProps<PalaisFormData>) {
  return (
    <StepOne
      data={data.stepOne}
      update={(patch) =>
        update({ stepOne: { ...data.stepOne, ...patch } as PalaisFormData["stepOne"] })
      }
      onValidityChange={onValidityChange}
      orgSlug={orgSlug}
      showErrors={showErrors}
      preselectDefaultUnloading
    />
  );
}

function PalaisStepTwo({ data, update, onValidityChange, orgSlug, showErrors }: StepProps<PalaisFormData>) {
  return (
    <StepTwo
      data={data.vehicle}
      update={(patch: Partial<Vehicle>) =>
        update({ vehicle: { ...data.vehicle, ...patch } as Vehicle })
      }
      onValidityChange={onValidityChange}
      orgSlug={orgSlug}
      showErrors={showErrors}
    />
  );
}

function PalaisStepThree({ data, update, onValidityChange, showErrors }: StepProps<PalaisFormData>) {
  return (
    <StepThree
      data={data.stepThree}
      update={(patch) =>
        update({ stepThree: { ...data.stepThree, ...patch } as PalaisFormData["stepThree"] })
      }
      onValidityChange={onValidityChange}
      showErrors={showErrors}
    />
  );
}

/**
 * StepFour reçoit la totalité du form sous une forme aplatie + un
 * callback de reset. On délègue ces props depuis le wizard parent via
 * un contexte React injecté en haut du rendu.
 */
function PalaisStepFour(_props: StepProps<PalaisFormData>) {
  void _props;
  const ctx = useStepFourContext();
  return (
    <StepFour
      data={ctx.data}
      onReset={ctx.onReset}
      onClearForm={ctx.onClearForm}
      onHasSavedChange={ctx.onHasSavedChange}
      onEditStep={ctx.onEditStep}
    />
  );
}

export const palaisSteps: StepDef<PalaisFormData>[] = [
  { id: "identification", label: "Identification", component: PalaisStepOne },
  { id: "vehicle", label: "Véhicule", component: PalaisStepTwo },
  { id: "message", label: "Message", component: PalaisStepThree },
  { id: "recap", label: "Récapitulatif", component: PalaisStepFour },
];
