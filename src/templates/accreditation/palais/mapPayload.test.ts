import { describe, expect, it } from "vitest";
import { mapPalaisPayload } from "./mapPayload";
import { getDefaultPalaisFormData } from "./types";
import { palaisPayloadSchema } from "./schema";

/**
 * Tests de non-régression sur le template Palais.
 *
 * Objectif : garantir que le mapping form → payload reste strictement
 * identique au comportement historique de `src/components/accreditation/StepFour.tsx`,
 * de façon à éviter toute régression côté Palais lors de l'introduction
 * du moteur multi-templates.
 */
describe("palais template — mapPayload", () => {
  it("produit le payload historique attendu pour un form complet", () => {
    const form = getDefaultPalaisFormData();
    form.stepOne = {
      company: "Décor Express",
      stand: "PALAIS 042",
      unloading: "Mathez",
      event: "marche-du-film-2026",
    };
    form.vehicle = {
      ...form.vehicle,
      plate: "AB-123-CD",
      size: "12m",
      phoneCode: "+33",
      phoneNumber: "612345678",
      date: "2026-09-10",
      time: "09:00",
      city: "Lyon",
      unloading: ["rear"],
      vehicleType: "PORTEUR",
    };
    form.stepThree = { message: "Note libre", consent: true, email: "" };

    const payload = mapPalaisPayload(form, "fr");

    expect(payload.organizationSlug).toBe("palais");
    expect(payload.company).toBe("Décor Express");
    expect(payload.stand).toBe("PALAIS 042");
    expect(payload.unloading).toBe("Mathez");
    expect(payload.event).toBe("marche-du-film-2026");
    expect(payload.vehicles).toHaveLength(1);
    expect(payload.vehicles[0].plate).toBe("AB-123-CD");
    expect(payload.vehicles[0].vehicleType).toBe("PORTEUR");
    expect(payload.vehicles[0].unloading).toEqual(["rear"]);
    expect(payload.message).toBe("Note libre");
    expect(payload.consent).toBe(true);
    expect(payload.language).toBe("fr");
    expect(payload.status).toBe("NOUVEAU");
    expect(payload.extension).toBeUndefined();
  });

  it("conserve les champs optionnels (kms, trailerPlate, pays, poids)", () => {
    const form = getDefaultPalaisFormData();
    form.stepOne = {
      company: "Test",
      stand: "001",
      unloading: "SVMM",
      event: "ev",
    };
    form.vehicle = {
      ...form.vehicle,
      plate: "FR-001",
      size: "S",
      phoneCode: "+33",
      phoneNumber: "1",
      date: "2026-01-01",
      city: "Paris",
      unloading: ["lat", "rear"],
      kms: "12500",
      trailerPlate: "TR-999",
      country: "ESPAGNE",
      estimatedKms: 1234,
      emptyWeight: 7,
      maxWeight: 40,
      currentWeight: 19,
    };
    form.stepThree = { message: "", consent: true, email: "" };

    const payload = mapPalaisPayload(form, "en");

    const v = payload.vehicles[0];
    expect(v.kms).toBe("12500");
    expect(v.trailerPlate).toBe("TR-999");
    expect(v.country).toBe("ESPAGNE");
    expect(v.estimatedKms).toBe(1234);
    expect(v.emptyWeight).toBe(7);
    expect(v.maxWeight).toBe(40);
    expect(v.currentWeight).toBe(19);
    expect(payload.language).toBe("en");
  });
});

describe("palais template — schema", () => {
  it("valide un payload Palais complet", () => {
    const valid = {
      organizationSlug: "palais",
      company: "X",
      stand: "1",
      unloading: "Mathez",
      event: "ev",
      vehicles: [
        {
          plate: "AB-001-CD",
          size: "L",
          phoneCode: "+33",
          phoneNumber: "1",
          date: "2026-01-01",
          city: "Lyon",
          unloading: ["rear"],
        },
      ],
      consent: true,
      language: "fr",
    };
    const result = palaisPayloadSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejette un payload Palais sans plaque (plate obligatoire côté template)", () => {
    const invalid = {
      organizationSlug: "palais",
      company: "X",
      stand: "1",
      unloading: "Mathez",
      event: "ev",
      vehicles: [
        {
          plate: "",
          size: "L",
          phoneCode: "+33",
          phoneNumber: "1",
          date: "2026-01-01",
          city: "Lyon",
          unloading: ["rear"],
        },
      ],
      consent: true,
    };
    const result = palaisPayloadSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejette un payload sans véhicule", () => {
    const invalid = {
      organizationSlug: "palais",
      company: "X",
      stand: "1",
      unloading: "Mathez",
      event: "ev",
      vehicles: [],
      consent: true,
    };
    const result = palaisPayloadSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
