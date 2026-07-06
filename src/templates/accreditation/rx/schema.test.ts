import { describe, it, expect } from "vitest";
import { mapRxPayload } from "./mapPayload";
import type { RxFormData } from "./types";
import { rxPayloadSchema } from "./schema";

function buildForm(): RxFormData {
  return {
    stepOne: {
      event: "cyf26",
      eventId: "13f93542-73bf-40f6-bc4a-66335de47184",
      exhibitorId: "ex-1",
      exhibitorName: "Test Exhibitor",
      exhibitorStand: "POWER 12",
      exhibitorSector: "CANTO — POWER",
      space: "POWER",
      contact: {
        firstName: "Jean",
        lastName: "Dupont",
        email: "jean@example.com",
        phoneCode: "+33",
        phoneNumber: "612345678",
      },
    },
    stepTwo: {
      categories: [
        {
          categoryId: "ponton-privatif",
          livDate: "2026-09-05",
          livTime: "12:00-13:00",
          repDate: "2026-09-13",
          repTime: "19:00-20:00",
          vehicles: [{ vehicleType: "VL", plate: null, repSameAsDelivery: true }],
        },
      ],
      skipMontage: false,
      skipDemontage: false,
    },
    stepThree: {
      manutentionProvider: "SVMM",
      manutentionProviderOther: "",
      scalesAcknowledged: false,
      consent: true,
    },
  };
}

const ok = (form: RxFormData) =>
  rxPayloadSchema.safeParse(mapRxPayload(form, "fr")).success;

describe("rx schema — validation conditionnelle (skip / Autre)", () => {
  it("montage + démontage complets → valide", () => {
    expect(ok(buildForm())).toBe(true);
  });

  it("skip montage : livraison vide tolérée → valide", () => {
    const f = buildForm();
    f.stepTwo.skipMontage = true;
    f.stepTwo.categories[0].livDate = "";
    f.stepTwo.categories[0].livTime = "";
    expect(ok(f)).toBe(true);
  });

  it("sans skip montage : livraison vide → invalide", () => {
    const f = buildForm();
    f.stepTwo.categories[0].livDate = "";
    f.stepTwo.categories[0].livTime = "";
    expect(ok(f)).toBe(false);
  });

  it("skip démontage : reprise vide tolérée → valide", () => {
    const f = buildForm();
    f.stepTwo.skipDemontage = true;
    f.stepTwo.categories[0].repDate = "";
    f.stepTwo.categories[0].repTime = "";
    expect(ok(f)).toBe(true);
  });

  it("sans skip démontage : reprise vide → invalide", () => {
    const f = buildForm();
    f.stepTwo.categories[0].repDate = "";
    f.stepTwo.categories[0].repTime = "";
    expect(ok(f)).toBe(false);
  });

  it("impossible de sauter montage ET démontage → invalide", () => {
    const f = buildForm();
    f.stepTwo.skipMontage = true;
    f.stepTwo.skipDemontage = true;
    f.stepTwo.categories[0].livDate = "";
    f.stepTwo.categories[0].livTime = "";
    f.stepTwo.categories[0].repDate = "";
    f.stepTwo.categories[0].repTime = "";
    expect(ok(f)).toBe(false);
  });

  it("prestataire « Autre » sans texte → invalide ; avec texte → valide", () => {
    const f = buildForm();
    f.stepThree.manutentionProvider = "Autre";
    f.stepThree.manutentionProviderOther = "";
    expect(ok(f)).toBe(false);
    f.stepThree.manutentionProviderOther = "Transports Durand";
    expect(ok(f)).toBe(true);
  });
});
