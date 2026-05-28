"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Vehicle } from "@/types";

/**
 * StepFour (récapitulatif final) a besoin du form data aplati + de
 * callbacks pour reset/clearForm/hasSaved fournis par le wizard parent.
 * Comme on ne peut pas changer la signature de `StepFour` (composant
 * partagé), on injecte ces props via un contexte React local au template
 * Palais.
 */

export interface PalaisStepFourCtx {
  data: {
    company: string;
    stand: string;
    unloading: string;
    event: string;
    vehicles: Vehicle[];
    message: string;
    consent: boolean;
  };
  onReset: () => void;
  onClearForm: () => void;
  onHasSavedChange: (hasSaved: boolean) => void;
}

const Ctx = createContext<PalaisStepFourCtx | null>(null);

export function PalaisStepFourProvider({
  value,
  children,
}: {
  value: PalaisStepFourCtx;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStepFourContext(): PalaisStepFourCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useStepFourContext doit être utilisé à l'intérieur d'un <PalaisStepFourProvider>"
    );
  }
  return ctx;
}
