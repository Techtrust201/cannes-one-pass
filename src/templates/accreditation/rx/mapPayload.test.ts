import { describe, expect, it } from "vitest";
import { mapRxPayload } from "./mapPayload";
import { getDefaultRxFormData, type RxFormData } from "./types";
import { rxPayloadSchema } from "./schema";

function buildRxForm(): RxFormData {
  return {
    stepOne: {
      event: "yachting-2026",
      exhibitorId: "exhibitor-id-1",
      exhibitorName: "Test Exhibitor",
      exhibitorStand: "PALAIS 110",
      exhibitorSector: "PALAIS — PALAIS",
      space: "INTERIEUR_PALAIS",
      contact: {
        firstName: "Jean",
        lastName: "Dupont",
        email: "jean.dupont@example.com",
        phoneCode: "+33",
        phoneNumber: "612345678",
      },
    },
    stepTwo: {
      categories: [
        {
          categoryId: "stand-nu-int",
          livDate: "2026-09-04",
          livTime: "09:00",
          repDate: "2026-09-14",
          repTime: "10:00",
          vehicles: [
            { vehicleType: "PORTEUR", plate: null },
            { vehicleType: "SEMI_REMORQUE", plate: "FR-999" },
          ],
        },
      ],
    },
    stepThree: {
      manutentionProvider: "SVMM",
      scalesAcknowledged: false,
      consent: true,
    },
  };
}

describe("rx template — mapPayload", () => {
  it("aplatit les véhicules de chaque catégorie en une seule liste", () => {
    const form = buildRxForm();
    const payload = mapRxPayload(form, "fr");

    expect(payload.organizationSlug).toBe("rx");
    expect(payload.company).toBe("Test Exhibitor");
    expect(payload.stand).toBe("PALAIS 110");
    expect(payload.event).toBe("yachting-2026");
    expect(payload.unloading).toBe("SVMM");
    expect(payload.vehicles).toHaveLength(2);
    expect(payload.vehicles[0].vehicleType).toBe("PORTEUR");
    expect(payload.vehicles[0].plate).toBeNull(); // RX : plaque optionnelle
    expect(payload.vehicles[1].plate).toBe("FR-999");
    expect(payload.vehicles[0].date).toBe("2026-09-04"); // créneau de la catégorie
    expect(payload.consent).toBe(true);
    expect(payload.language).toBe("fr");
  });

  it("statut par défaut NOUVEAU, pas de split par défaut", () => {
    const payload = mapRxPayload(buildRxForm(), "fr");
    expect(payload.status).toBe("NOUVEAU");
    expect(payload.splitPerVehicle).toBe(false);
  });

  it("propage le statut et le flag split via les options", () => {
    const payload = mapRxPayload(buildRxForm(), "fr", {
      status: "ATTENTE",
      split: true,
    });
    expect(payload.status).toBe("ATTENTE");
    expect(payload.splitPerVehicle).toBe(true);
  });

  it("embarque le contexte de catégorie sur chaque véhicule (pour le split)", () => {
    const payload = mapRxPayload(buildRxForm(), "fr", { split: true });
    expect(payload.vehicles[0].categoryId).toBe("stand-nu-int");
    expect(payload.vehicles[0].repDate).toBe("2026-09-14");
    expect(payload.vehicles[0].repTime).toBe("10:00");
    expect(payload.vehicles[1].categoryId).toBe("stand-nu-int");
  });

  it("emporte l'extension complète (contact, catégories, espace, manutention)", () => {
    const payload = mapRxPayload(buildRxForm(), "fr");
    expect(payload.extension).toBeDefined();
    const ext = payload.extension!;
    expect(ext.exhibitor).toEqual({
      id: "exhibitor-id-1",
      name: "Test Exhibitor",
      stand: "PALAIS 110",
      sector: "PALAIS — PALAIS",
    });
    expect(ext.contact).toMatchObject({ firstName: "Jean", lastName: "Dupont" });
    expect(ext.space).toBe("INTERIEUR_PALAIS");
    expect(ext.manutentionProvider).toBe("SVMM");
    expect(Array.isArray(ext.categories)).toBe(true);
  });

  it("résout les champs reprise sur chaque véhicule", () => {
    const form = buildRxForm();
    form.stepTwo.categories[0].vehicles[1].repSameAsDelivery = false;
    form.stepTwo.categories[0].vehicles[1].repVehicleType = "VL";
    form.stepTwo.categories[0].vehicles[1].repPlate = "ZZ999ZZ";
    form.stepTwo.categories[0].vehicles[1].repPhoneCode = "+33";
    form.stepTwo.categories[0].vehicles[1].repPhoneNumber = "700000000";

    const payload = mapRxPayload(form, "fr", { split: true });
    expect(payload.vehicles[1].repSameAsDelivery).toBe(false);
    expect(payload.vehicles[1].repVehicleType).toBe("VL");
    expect(payload.vehicles[1].repPlate).toBe("ZZ999ZZ");
    expect(payload.vehicles[1].repPhoneNumber).toBe("700000000");
    expect(payload.vehicles[0].repSameAsDelivery).toBe(true);
    expect(payload.vehicles[0].repVehicleType).toBe("PORTEUR");
  });

  it("propage repInterveningCompany / repCity quand reprise différente", () => {
    const form = buildRxForm();
    form.stepTwo.categories[0].vehicles[0].repSameAsDelivery = false;
    form.stepTwo.categories[0].vehicles[0].repVehicleType = "VL";
    form.stepTwo.categories[0].vehicles[0].repInterveningCompany = "Transports Durand";
    form.stepTwo.categories[0].vehicles[0].repCity = "Lyon";
    form.stepTwo.categories[0].vehicles[0].repCountry = "FRANCE";
    form.stepTwo.categories[0].vehicles[0].repEstimatedKms = 450;

    const payload = mapRxPayload(form, "fr", { split: true });
    expect(payload.vehicles[0].repInterveningCompany).toBe("Transports Durand");
    expect(payload.vehicles[0].repCity).toBe("Lyon");
    expect(payload.vehicles[0].repCountry).toBe("FRANCE");
    expect(payload.vehicles[0].repEstimatedKms).toBe(450);
    const extCategories = payload.extension?.categories as Array<{
      vehicles: Array<{ repCity?: string; repInterveningCompany?: string }>;
    }>;
    expect(extCategories[0].vehicles[0].repCity).toBe("Lyon");
    expect(extCategories[0].vehicles[0].repInterveningCompany).toBe("Transports Durand");
  });

  it("repCity héritée de la livraison quand reprise identique", () => {
    const form = buildRxForm();
    form.stepTwo.categories[0].vehicles[0].city = "Paris";
    form.stepTwo.categories[0].vehicles[0].country = "FRANCE";
    form.stepTwo.categories[0].vehicles[0].estimatedKms = 930;
    form.stepTwo.categories[0].vehicles[0].interveningCompany = "Logistique A";

    const payload = mapRxPayload(form, "fr");
    expect(payload.vehicles[0].repSameAsDelivery).toBe(true);
    expect(payload.vehicles[0].repCity).toBe("Paris");
    expect(payload.vehicles[0].repCountry).toBe("FRANCE");
    expect(payload.vehicles[0].repEstimatedKms).toBe(930);
    expect(payload.vehicles[0].repInterveningCompany).toBe("Logistique A");
  });

  it("accepte un formulaire vide (état initial) sans crasher", () => {
    const empty = getDefaultRxFormData();
    const payload = mapRxPayload(empty, "fr");
    expect(payload.organizationSlug).toBe("rx");
    expect(payload.vehicles).toEqual([]);
  });

  it("propage skipMontage / skipDemontage dans l'extension", () => {
    const form = buildRxForm();
    form.stepTwo.skipMontage = true;
    form.stepTwo.skipDemontage = false;
    const ext = mapRxPayload(form, "fr").extension!;
    expect(ext.skipMontage).toBe(true);
    expect(ext.skipDemontage).toBe(false);
  });

  it("skip montage : la date principale du véhicule retombe sur la reprise", () => {
    const form = buildRxForm();
    form.stepTwo.skipMontage = true;
    // Pas de montage : on vide les dates de livraison.
    form.stepTwo.categories[0].livDate = "";
    form.stepTwo.categories[0].livTime = "";
    const payload = mapRxPayload(form, "fr", { split: true });
    expect(payload.vehicles[0].date).toBe("2026-09-14"); // = repDate
  });

  it("prestataire « Autre » : libellé résolu + texte libre en extension", () => {
    const form = buildRxForm();
    form.stepThree.manutentionProvider = "Autre";
    form.stepThree.manutentionProviderOther = "Transports Durand";
    const payload = mapRxPayload(form, "fr");
    expect(payload.unloading).toBe("Autre : Transports Durand");
    expect(payload.extension!.manutentionProviderOther).toBe("Transports Durand");
  });

  it("payload logisticien ATTENTE + split passe la validation Zod", () => {
    const payload = mapRxPayload(buildRxForm(), "fr", {
      status: "ATTENTE",
      split: true,
    });
    expect(payload.status).toBe("ATTENTE");
    expect(payload.splitPerVehicle).toBe(true);
    const result = rxPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("sanitise vehicleType undefined (localStorage corrompu) en chaîne vide", () => {
    const form = buildRxForm();
    form.stepTwo.categories[0].vehicles[0].vehicleType = undefined as unknown as string;
    const payload = mapRxPayload(form, "fr", { split: true });
    expect(payload.vehicles[0].vehicleType).toBe("");
    const extCategories = payload.extension?.categories as Array<{
      vehicles: Array<{ vehicleType: string }>;
    }>;
    expect(extCategories[0].vehicles[0].vehicleType).toBe("");
    const result = rxPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("vehicleType"))).toBe(
        true
      );
    }
  });

  it("propage city / country / estimatedKms quand renseignés", () => {
    const form = buildRxForm();
    form.stepTwo.categories[0].vehicles[0].city = "Paris";
    form.stepTwo.categories[0].vehicles[0].country = "FRANCE";
    form.stepTwo.categories[0].vehicles[0].estimatedKms = 930;
    const payload = mapRxPayload(form, "fr", { split: true });
    expect(payload.vehicles[0].city).toBe("Paris");
    expect(payload.vehicles[0].country).toBe("FRANCE");
    expect(payload.vehicles[0].estimatedKms).toBe(930);
    const extCategories = payload.extension?.categories as Array<{
      vehicles: Array<{ city?: string; country?: string; estimatedKms?: number }>;
    }>;
    expect(extCategories[0].vehicles[0].city).toBe("Paris");
    expect(extCategories[0].vehicles[0].country).toBe("FRANCE");
    expect(extCategories[0].vehicles[0].estimatedKms).toBe(930);
  });

  it("city vide reste accepté (optionnel)", () => {
    const payload = mapRxPayload(buildRxForm(), "fr");
    expect(payload.vehicles[0].city).toBe("");
    expect(rxPayloadSchema.safeParse(payload).success).toBe(true);
  });
});

describe("rx template — schema", () => {
  it("valide un payload RX avec plaque nulle (workflow scan)", () => {
    const payload = mapRxPayload(buildRxForm(), "fr");
    // Le payload retourné par mapRxPayload n'inclut pas `consent` à false :
    // on l'ajoute pour respecter le schéma.
    const result = rxPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("rejette un véhicule RX sans gabarit (vehicleType obligatoire)", () => {
    const form = buildRxForm();
    form.stepTwo.categories[0].vehicles[0].vehicleType = "";
    const payload = mapRxPayload(form, "fr");
    const result = rxPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("rejette un payload sans catégorie", () => {
    const form = buildRxForm();
    form.stepTwo.categories = [];
    const payload = mapRxPayload(form, "fr");
    const result = rxPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});
