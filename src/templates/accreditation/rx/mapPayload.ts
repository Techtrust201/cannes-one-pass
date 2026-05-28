import type { CreateAccreditationPayload } from "../types";
import type { RxFormData } from "./types";

/**
 * Mapping form data RX → payload `POST /api/accreditations`.
 *
 * Particularités RX :
 * - `company` / `stand` proviennent de l'exposant sélectionné.
 * - `vehicles` est la concaténation de tous les véhicules attendus
 *   déclarés dans chaque catégorie cochée. Chacun emporte le créneau
 *   (`date` + `time`) de sa catégorie d'origine.
 * - `extension` regroupe les champs RX-spécifiques pour le back-office.
 */
export function mapRxPayload(
  form: RxFormData,
  language: string
): CreateAccreditationPayload {
  const vehicles: CreateAccreditationPayload["vehicles"] = [];

  for (const cat of form.stepTwo.categories) {
    for (const v of cat.vehicles) {
      vehicles.push({
        plate: v.plate ?? null,
        size: "", // taille libre, non utilisée par RX → vide
        phoneCode: form.stepOne.contact.phoneCode,
        phoneNumber: form.stepOne.contact.phoneNumber,
        date: cat.livDate,
        time: cat.livTime,
        city: "",
        unloading: ["rear"],
        vehicleType: v.vehicleType,
        trailerPlate: v.trailerPlate,
      });
    }
  }

  // Détecte si au moins une catégorie déclenche le prestataire Scales auto
  // (rempli côté config.ts en Phase 4 ; pour l'instant on s'aligne sur le flag).
  const scalesAssigned = form.stepTwo.categories.some(
    () => false // sera renseigné lorsque la config RX sera branchée
  );

  return {
    organizationSlug: "rx",
    company: form.stepOne.exhibitorName,
    stand: form.stepOne.exhibitorStand,
    unloading: form.stepThree.manutentionProvider || "Autonome",
    event: form.stepOne.event,
    vehicles,
    consent: form.stepThree.consent,
    language,
    status: "NOUVEAU",
    extension: {
      exhibitor: {
        id: form.stepOne.exhibitorId,
        name: form.stepOne.exhibitorName,
        stand: form.stepOne.exhibitorStand,
        sector: form.stepOne.exhibitorSector,
      },
      contact: form.stepOne.contact,
      space: form.stepOne.space,
      categories: form.stepTwo.categories,
      scalesAssigned,
      manutentionProvider: form.stepThree.manutentionProvider,
    },
  };
}
