import type { CreateAccreditationPayload } from "../types";
import type { RxFormData } from "./types";
import { findCategory } from "./config";
import { suggestZone } from "@/lib/rx-zone-rules";

function resolveRepFields(
  v: RxFormData["stepTwo"]["categories"][number]["vehicles"][number],
  contact: RxFormData["stepOne"]["contact"]
) {
  const same = v.repSameAsDelivery !== false;
  return {
    repSameAsDelivery: same,
    repVehicleType: same ? v.vehicleType : (v.repVehicleType ?? v.vehicleType),
    repPlate: same ? (v.plate ?? null) : (v.repPlate ?? null),
    repPhoneCode: same
      ? contact.phoneCode
      : (v.repPhoneCode ?? contact.phoneCode),
    repPhoneNumber: same
      ? contact.phoneNumber
      : (v.repPhoneNumber ?? contact.phoneNumber),
  };
}

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
  options?: {
    status?: string;
    split?: boolean;
    palmBeachAtCantoCodes?: Set<string>;
  }
): CreateAccreditationPayload {
  const vehicles: CreateAccreditationPayload["vehicles"] = [];

  for (const cat of form.stepTwo.categories) {
    for (const v of cat.vehicles) {
      const rep = resolveRepFields(v, form.stepOne.contact);
      // Date/heure principale du véhicule : montage si présent, sinon
      // démontage (cas « accréditation uniquement pour le démontage »).
      const primaryDate = cat.livDate || cat.repDate;
      const primaryTime = cat.livTime || cat.repTime;
      vehicles.push({
        plate: v.plate ?? null,
        size: "", // taille libre, non utilisée par RX → vide
        phoneCode: form.stepOne.contact.phoneCode,
        phoneNumber: form.stepOne.contact.phoneNumber,
        date: primaryDate ?? "",
        time: primaryTime ?? "",
        city: (v.city ?? "").trim(),
        country: v.country,
        estimatedKms: v.estimatedKms,
        unloading: ["rear"],
        vehicleType: v.vehicleType ?? "",
        trailerPlate: v.trailerPlate,
        // Contexte de catégorie embarqué par véhicule : indispensable au
        // split (1 accréditation par véhicule) côté API pour reconstituer
        // l'extension de chaque accréditation.
        categoryId: cat.categoryId,
        repDate: cat.repDate,
        repTime: cat.repTime,
        interveningCompany: v.interveningCompany,
        ...rep,
      });
    }
  }

  // Détecte si au moins une catégorie cochée déclenche la manutention Scales
  // automatique (matrice espace × catégorie dans config.ts).
  const scalesAssigned = form.stepTwo.categories.some(
    (c) => findCategory(form.stepOne.space, c.categoryId)?.scales === true
  );

  // Zone de déchargement suggérée (pré-assignation back-office) : déduite du
  // gabarit du 1er véhicule et du port de l'exposant. Le logisticien pourra
  // la modifier à la validation.
  const firstVehicleType = form.stepTwo.categories[0]?.vehicles[0]?.vehicleType;
  const suggestedZone = suggestZone(
    firstVehicleType,
    form.stepOne.exhibitorSector,
    options?.palmBeachAtCantoCodes
  );

  // Libellé prestataire effectif : si « Autre », on prend le texte libre.
  const provider = form.stepThree.manutentionProvider;
  const providerOther = form.stepThree.manutentionProviderOther?.trim();
  const resolvedProvider =
    provider === "Autre" && providerOther ? `Autre : ${providerOther}` : provider;

  return {
    organizationSlug: "rx",
    company: form.stepOne.exhibitorName,
    stand: form.stepOne.exhibitorStand,
    unloading: resolvedProvider || "Autonome",
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
      categories: form.stepTwo.categories.map((cat) => ({
        ...cat,
        livDate: cat.livDate ?? "",
        livTime: cat.livTime ?? "",
        repDate: cat.repDate ?? "",
        repTime: cat.repTime ?? "",
        vehicles: cat.vehicles.map((v) => ({
          ...v,
          vehicleType: v.vehicleType ?? "",
          plate: v.plate ?? null,
        })),
      })),
      scalesAssigned,
      manutentionProvider: form.stepThree.manutentionProvider,
      manutentionProviderOther: providerOther || undefined,
      skipMontage: form.stepTwo.skipMontage ?? false,
      skipDemontage: form.stepTwo.skipDemontage ?? false,
      suggestedZone: suggestedZone ?? undefined,
    },
  };
}
