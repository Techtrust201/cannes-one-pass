import { describe, expect, it } from "vitest";
import { mapRxPayload } from "./mapPayload";
import { getDefaultRxFormData, type RxFormData } from "./types";
import { rxPayloadSchema } from "./schema";

function buildRxForm(): RxFormData {
  return {
    exhibitor: {
      id: "exhibitor-id-1",
      name: "Test Exhibitor",
      stand: "PALAIS 110",
      sector: "PALAIS — PALAIS",
      zone: "PALAIS 110",
      space: "INTERIEUR_PALAIS",
      requiresPalaisChoice: false,
      eventSlug: "yachting-2026",
    },
    contact: {
      firstName: "Jean",
      lastName: "Dupont",
      email: "jean.dupont@example.com",
      phoneCode: "+33",
      phoneNumber: "612345678",
    },
    delivery: {
      categories: [
        {
          categoryId: "stand-nu-int",
          date: "2026-09-04",
          slot: "09:00-10:00",
          vehicles: [
            { vehicleType: "PORTEUR", plate: null },
            { vehicleType: "SEMI_REMORQUE", plate: "FR-999" },
          ],
        },
      ],
    },
    pickup: {
      categories: [
        { categoryId: "stand-nu-int", date: "2026-09-14", slot: "10:00-11:00" },
      ],
    },
    manutention: { provider: "SVMM" },
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
    expect(payload.vehicles[0].date).toBe("2026-09-04");
    expect(payload.vehicles[0].time).toBe("09:00-10:00");
    expect(payload.consent).toBe(true);
    expect(payload.language).toBe("fr");
  });

  it("emporte l'extension complète (contact, delivery, pickup, espace, manutention)", () => {
    const payload = mapRxPayload(buildRxForm(), "fr");
    expect(payload.extension).toBeDefined();
    const ext = payload.extension as Record<string, unknown>;
    expect(ext.exhibitor).toEqual({
      id: "exhibitor-id-1",
      name: "Test Exhibitor",
      stand: "PALAIS 110",
      sector: "PALAIS — PALAIS",
      zone: "PALAIS 110",
    });
    expect(ext.contact).toMatchObject({ firstName: "Jean", lastName: "Dupont" });
    expect(ext.space).toBe("INTERIEUR_PALAIS");
    expect(ext.manutentionProvider).toBe("SVMM");
    expect(ext.delivery).toBeDefined();
    expect(ext.pickup).toBeDefined();
  });

  it("flag scalesAssigned=true quand une catégorie cochée nécessite Scales", () => {
    const form = buildRxForm();
    form.delivery.categories = [
      {
        categoryId: "bateau-terre-int",
        date: "2026-09-04",
        slot: "10:00-11:00",
        vehicles: [{ vehicleType: "SEMI_REMORQUE", plate: null }],
      },
    ];
    const payload = mapRxPayload(form, "fr");
    const ext = payload.extension as Record<string, unknown>;
    expect(ext.scalesAssigned).toBe(true);
  });

  it("accepte un formulaire vide (état initial) sans crasher", () => {
    const empty = getDefaultRxFormData();
    const payload = mapRxPayload(empty, "fr");
    expect(payload.organizationSlug).toBe("rx");
    expect(payload.vehicles).toEqual([]);
  });
});

describe("rx template — schema", () => {
  it("valide un payload RX avec plaque nulle (workflow scan)", () => {
    const payload = mapRxPayload(buildRxForm(), "fr");
    const result = rxPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("rejette un véhicule RX sans gabarit (vehicleType obligatoire)", () => {
    const form = buildRxForm();
    form.delivery.categories[0]!.vehicles[0]!.vehicleType = "";
    const payload = mapRxPayload(form, "fr");
    const result = rxPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("rejette un payload sans catégorie de livraison", () => {
    const form = buildRxForm();
    form.delivery.categories = [];
    const payload = mapRxPayload(form, "fr");
    const result = rxPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});
