import type { CreateAccreditationPayload } from "../types";
import type { PalaisFormData } from "./types";

/**
 * Mapping form data Palais → payload `POST /api/accreditations`.
 * Reproduit strictement le mapping historique de
 * `src/components/accreditation/StepFour.tsx` pour garantir zéro régression.
 */
export function mapPalaisPayload(
  form: PalaisFormData,
  language: string
): CreateAccreditationPayload {
  return {
    organizationSlug: "palais",
    company: form.stepOne.company,
    stand: form.stepOne.stand,
    unloading: form.stepOne.unloading,
    event: form.stepOne.event,
    vehicles: [
      {
        plate: form.vehicle.plate,
        size: form.vehicle.size,
        phoneCode: form.vehicle.phoneCode,
        phoneNumber: form.vehicle.phoneNumber,
        date: form.vehicle.date,
        time: form.vehicle.time,
        city: form.vehicle.city,
        unloading: form.vehicle.unloading,
        kms: form.vehicle.kms,
        vehicleType: form.vehicle.vehicleType,
        country: form.vehicle.country,
        estimatedKms: form.vehicle.estimatedKms,
        trailerPlate: form.vehicle.trailerPlate,
        emptyWeight: form.vehicle.emptyWeight,
        maxWeight: form.vehicle.maxWeight,
        currentWeight: form.vehicle.currentWeight,
      },
    ],
    message: form.stepThree.message,
    consent: form.stepThree.consent,
    email: form.stepThree.email?.trim() || undefined,
    language,
    status: "NOUVEAU",
  };
}
