import type { CreateAccreditationPayload } from "../types";
import type { RxFormData } from "./types";
import { findCategory } from "./config";
import { sanitizeLocalPhoneNumber } from "@/lib/phone-input-utils";
import { suggestZone, type RxZoneRouting } from "@/lib/rx-zone-rules";

function normalizeContact(contact: RxFormData["stepOne"]["contact"]) {
  return {
    ...contact,
    phoneNumber: sanitizeLocalPhoneNumber(contact.phoneCode, contact.phoneNumber),
  };
}

/**
 * Téléphone effectif du chauffeur de livraison : téléphone saisi sur le
 * véhicule s'il existe, sinon repli sur le téléphone du contact (responsable
 * logistique). Le numéro est sanitisé selon l'indicatif retenu.
 */
function resolveDeliveryDriverPhone(
  v: RxFormData["stepTwo"]["categories"][number]["vehicles"][number],
  contact: RxFormData["stepOne"]["contact"]
): { phoneCode: string; phoneNumber: string } {
  const hasOwn = !!v.phoneNumber?.trim();
  const code = hasOwn ? (v.phoneCode?.trim() || contact.phoneCode) : contact.phoneCode;
  const number = hasOwn
    ? sanitizeLocalPhoneNumber(code, v.phoneNumber!)
    : contact.phoneNumber;
  return { phoneCode: code, phoneNumber: number };
}

function resolveRepFields(
  v: RxFormData["stepTwo"]["categories"][number]["vehicles"][number],
  contact: RxFormData["stepOne"]["contact"]
) {
  const same = v.repSameAsDelivery !== false;
  // Reprise « même véhicule » : on reprend le chauffeur de la livraison (et
  // non plus systématiquement le contact), pour rester cohérent avec le
  // téléphone chauffeur saisi côté montage.
  const deliveryDriver = resolveDeliveryDriverPhone(v, contact);
  const repCode = same
    ? deliveryDriver.phoneCode
    : (v.repPhoneCode ?? contact.phoneCode);
  const repNumber = same
    ? deliveryDriver.phoneNumber
    : (v.repPhoneNumber ?? contact.phoneNumber);
  return {
    repSameAsDelivery: same,
    repVehicleType: same ? v.vehicleType : (v.repVehicleType ?? v.vehicleType),
    repPlate: same ? (v.plate ?? null) : (v.repPlate ?? null),
    repPhoneCode: repCode,
    repPhoneNumber: sanitizeLocalPhoneNumber(repCode, repNumber),
    repInterveningCompany: same
      ? v.interveningCompany
      : v.repInterveningCompany,
    repCity: same ? (v.city ?? "").trim() : (v.repCity ?? "").trim(),
    repCountry: same ? v.country : v.repCountry,
    repEstimatedKms: same ? v.estimatedKms : v.repEstimatedKms,
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
    zoneRouting?: Map<string, RxZoneRouting>;
  }
): CreateAccreditationPayload {
  const contact = normalizeContact(form.stepOne.contact);
  const vehicles: CreateAccreditationPayload["vehicles"] = [];

  for (const cat of form.stepTwo.categories) {
    for (const v of cat.vehicles) {
      const rep = resolveRepFields(v, contact);
      const driver = resolveDeliveryDriverPhone(v, contact);
      // Date/heure principale du véhicule : montage si présent, sinon
      // démontage (cas « accréditation uniquement pour le démontage »).
      const primaryDate = cat.livDate || cat.repDate;
      const primaryTime = cat.livTime || cat.repTime;
      vehicles.push({
        plate: v.plate ?? null,
        size: "", // taille libre, non utilisée par RX → vide
        phoneCode: driver.phoneCode,
        phoneNumber: driver.phoneNumber,
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
    options?.palmBeachAtCantoCodes,
    options?.zoneRouting
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
      contact,
      space: form.stepOne.space,
      // Critères naturels uniquement (jamais l'ID interne) : le serveur
      // résout lui-même exhibitorId/exhibitorLocationId dans son contexte
      // organisation/événement. Absent si aucun emplacement n'a été résolu
      // côté client (fonctionnement legacy inchangé dans ce cas).
      location: form.stepOne.exhibitorLocationId
        ? {
            code: form.stepOne.locationLabel || null,
            type: (form.stepOne.locationType || null) as "TERRE" | "FLOT" | "STAND" | null,
          }
        : undefined,
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
