import type { Vehicle } from "@/types";

/**
 * Shape du form data pour le template Palais.
 * Doit rester identique au shape historique de `src/app/accreditation/page.tsx`
 * pour garantir zéro régression (et compatibilité du localStorage existant).
 */
export interface PalaisFormData {
  stepOne: {
    company: string;
    stand: string;
    unloading: string;
    event: string;
  };
  vehicle: Vehicle;
  stepThree: {
    message: string;
    consent: boolean;
    /** E-mail facultatif du demandeur (Lot 2 : envoi récap + QR à la création). */
    email: string;
  };
}

export function getDefaultPalaisFormData(): PalaisFormData {
  return {
    stepOne: { company: "", stand: "", unloading: "", event: "" },
    vehicle: {
      id: 1,
      plate: "",
      size: "",
      phoneCode: "+33",
      phoneNumber: "",
      date: "",
      time: "",
      city: "",
      unloading: [],
    },
    stepThree: { message: "", consent: false, email: "" },
  };
}
