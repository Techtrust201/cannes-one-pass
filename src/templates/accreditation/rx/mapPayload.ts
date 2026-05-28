import type { CreateAccreditationPayload } from "../types";
import type { RxFormData } from "./types";
import { findCategory } from "./config";

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
  language: string,
  options?: { status?: string; split?: boolean }
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
        // Contexte de catégorie embarqué par véhicule : indispensable au
        // split (1 accréditation par véhicule) côté API pour reconstituer
        // l'extension de chaque accréditation.
        categoryId: cat.categoryId,
        repDate: cat.repDate,
        repTime: cat.repTime,
      });
    }
  }

  // Détecte si au moins une catégorie cochée déclenche la manutention Scales
  // automatique (matrice espace × catégorie dans config.ts).
  const scalesAssigned = form.stepTwo.categories.some(
    (c) => findCategory(form.stepOne.space, c.categoryId)?.scales === true
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
    // Statut selon le contexte : public → NOUVEAU (en attente de validation),
    // logisticien → ATTENTE (validé). Défaut NOUVEAU.
    status: options?.status ?? "NOUVEAU",
    // Une accréditation par véhicule à la création (workflow RX).
    splitPerVehicle: options?.split ?? false,
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
