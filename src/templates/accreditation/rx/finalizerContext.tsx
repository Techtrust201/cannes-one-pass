"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Le step final RX (Manutention) a besoin de réinitialiser le wizard
 * (form data + localStorage + retour step 1) après soumission. Comme on
 * ne veut pas étendre la signature générique `StepProps`, on expose les
 * fonctions via un contexte React local au template RX, similaire au
 * `PalaisStepFourContext`.
 */
export interface RxFinalizerCtx {
  /** Réinitialise complètement le formulaire et revient au step 1. */
  resetAll: () => void;
  /** Vide le formulaire (data + localStorage) sans changer de step. */
  clearForm: () => void;
  /** Marque le wizard comme "soumis" (cache le bouton Retour). */
  setHasSaved: (hasSaved: boolean) => void;
}

const Ctx = createContext<RxFinalizerCtx | null>(null);

export function RxFinalizerProvider({
  value,
  children,
}: {
  value: RxFinalizerCtx;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRxFinalizer(): RxFinalizerCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useRxFinalizer doit être utilisé à l'intérieur d'un <RxFinalizerProvider>"
    );
  }
  return ctx;
}
