import { describe, expect, it } from "vitest";
import { planRxPdfPages } from "@/lib/accreditation-pdf-vehicle-pages";

const montage = {
  id: 1,
  logisticsRole: "MONTAGE" as const,
  plate: "AA-111-AA",
  vehicleType: "PORTEUR",
};
const demontage = {
  id: 2,
  logisticsRole: "DEMONTAGE" as const,
  plate: "BB-222-BB",
  vehicleType: "VL",
};
const both = {
  id: 3,
  logisticsRole: "BOTH" as const,
  plate: "CC-333-CC",
  vehicleType: "VL",
};
const legacy = { id: 9, plate: "LEG-ACY-01", vehicleType: "VL" };

describe("planRxPdfPages", () => {
  it("BOTH → une page avec les deux QR", () => {
    const pages = planRxPdfPages([both]);
    expect(pages).toHaveLength(1);
    expect(pages[0].kind).toBe("both");
    expect(pages[0].qrPhases).toEqual(["livraison", "reprise"]);
    expect(pages[0].vehicle?.id).toBe(3);
  });

  it("MONTAGE seul → une page montage", () => {
    const pages = planRxPdfPages([montage], { skipDemontage: true });
    expect(pages).toHaveLength(1);
    expect(pages[0].kind).toBe("montage");
    expect(pages[0].qrPhases).toEqual(["livraison"]);
  });

  it("DEMONTAGE seul → une page démontage", () => {
    const pages = planRxPdfPages([demontage], { skipMontage: true });
    expect(pages).toHaveLength(1);
    expect(pages[0].kind).toBe("demontage");
    expect(pages[0].qrPhases).toEqual(["reprise"]);
  });

  it("deux véhicules physiques → deux pages séparées", () => {
    const pages = planRxPdfPages([montage, demontage]);
    expect(pages).toHaveLength(2);
    expect(pages[0].kind).toBe("montage");
    expect(pages[0].vehicle?.id).toBe(1);
    expect(pages[0].vehicle?.plate).toBe("AA-111-AA");
    expect(pages[0].qrPhases).toEqual(["livraison"]);
    expect(pages[1].kind).toBe("demontage");
    expect(pages[1].vehicle?.id).toBe(2);
    expect(pages[1].vehicle?.plate).toBe("BB-222-BB");
    expect(pages[1].qrPhases).toEqual(["reprise"]);
    // Véhicule A absent de la page démontage
    expect(pages[1].vehicle?.plate).not.toBe("AA-111-AA");
    // Véhicule B absent de la page montage
    expect(pages[0].vehicle?.plate).not.toBe("BB-222-BB");
  });

  it("fallback historique sans rôle → legacy une page", () => {
    const pages = planRxPdfPages([legacy]);
    expect(pages).toHaveLength(1);
    expect(pages[0].kind).toBe("legacy");
    expect(pages[0].vehicle?.id).toBe(9);
  });
});
