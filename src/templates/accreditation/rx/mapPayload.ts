import type { CreateAccreditationPayload } from "../types";
import { RX_SPACES } from "./config";
import type { RxExtension, RxFormData } from "./types";

/**
 * Mapping form data RX → payload `POST /api/accreditations`.
 *
 * Particularités RX :
 * - `company` / `stand`   ← exposant sélectionné (combobox unique)
 * - `event`               ← event RX actif résolu côté wizard (Yachting 2026)
 * - `vehicles`            ← concaténation de tous les véhicules de toutes
 *                            les catégories de livraison (chaque véhicule
 *                            emporte la date+créneau de sa catégorie)
 * - `extension` (JSON DB) ← exhibitor + contact + space + delivery + pickup
 */
export function mapRxPayload(
  form: RxFormData,
  language: string
): CreateAccreditationPayload {
  const vehicles: CreateAccreditationPayload["vehicles"] = [];

  for (const cat of form.delivery.categories) {
    for (const v of cat.vehicles) {
      vehicles.push({
        plate: v.plate ?? null,
        size: "",
        phoneCode: form.contact.phoneCode,
        phoneNumber: form.contact.phoneNumber,
        date: cat.date,
        time: cat.slot,
        city: "",
        unloading: ["rear"],
        vehicleType: v.vehicleType,
        trailerPlate: v.trailerPlate,
      });
    }
  }

  // Scales auto-assigné si au moins une catégorie cochée a `scales: true`
  // dans la config du space courant.
  const spaceConfig = form.exhibitor.space
    ? RX_SPACES[form.exhibitor.space]
    : undefined;
  const scalesAssigned = spaceConfig
    ? form.delivery.categories.some((cat) => {
        const def = spaceConfig.categories.find((c) => c.id === cat.categoryId);
        return def?.scales === true;
      })
    : false;

  const extension: RxExtension = {
    exhibitor: {
      id: form.exhibitor.id,
      name: form.exhibitor.name,
      stand: form.exhibitor.stand,
      sector: form.exhibitor.sector,
      zone: form.exhibitor.zone,
    },
    contact: form.contact,
    space: form.exhibitor.space,
    delivery: form.delivery,
    pickup: form.pickup,
    scalesAssigned,
    manutentionProvider: form.manutention.provider,
  };

  return {
    organizationSlug: "rx",
    company: form.exhibitor.name,
    stand: form.exhibitor.stand,
    unloading: form.manutention.provider || "Autonome",
    event: form.exhibitor.eventSlug,
    vehicles,
    consent: true,
    language,
    status: "NOUVEAU",
    extension: extension as unknown as Record<string, unknown>,
  };
}
