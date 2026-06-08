import { describe, it, expect } from "vitest";
import {
  resolveVehicleTypeLabelFromList,
  resolveVehicleTypeShortLabelFromList,
} from "./vehicle-type-resolve";
import type { VehicleTypeData } from "./vehicle-utils";

function makeType(overrides: Partial<VehicleTypeData> & { code: string; label: string; gabarit: string }): VehicleTypeData {
  return {
    id: 1,
    tonnageMini: 0,
    tonnageMoyen: 0,
    tonnageMaxi: 0,
    co2Coefficient: 0,
    pdfCode: "C",
    color: "gray",
    showTrailerPlate: false,
    rxPalmBeachAtCanto: false,
    rxZoneCanto: null,
    rxZoneVieuxPort: null,
    sortOrder: 1,
    isActive: true,
    ...overrides,
  };
}

const types: VehicleTypeData[] = [
  makeType({ id: 1, code: "VL", label: "VL", gabarit: "VL", pdfCode: "A" }),
  makeType({ id: 2, code: "PORTEUR_LEGER", label: "10 m³", gabarit: "10 m³", pdfCode: "B" }),
  makeType({ id: 3, code: "PORTEUR", label: "15 m³", gabarit: "15 m³" }),
  makeType({ id: 4, code: "GROS_PORTEUR", label: "20 m³", gabarit: "20 m³" }),
  makeType({ id: 5, code: "SEMI_REMORQUE", label: "Semi-remorque (~90 m³)", gabarit: "~90 m³", showTrailerPlate: true, pdfCode: "D" }),
];

describe("resolveVehicleTypeLabelFromList", () => {
  it("code connu → gabarit DB", () => {
    expect(resolveVehicleTypeLabelFromList(types, "GROS_PORTEUR")).toBe("20 m³");
    expect(resolveVehicleTypeLabelFromList(types, "VL")).toBe("VL");
    expect(resolveVehicleTypeLabelFromList(types, "SEMI_REMORQUE")).toBe("~90 m³");
  });

  it("vehicleType=VL, size='' → VL", () => {
    expect(resolveVehicleTypeLabelFromList(types, "VL", "")).toBe("VL");
  });

  it("code inconnu + vehicleType renseigné → humanisé, pas PORTEUR", () => {
    const label = resolveVehicleTypeLabelFromList(types, "CUSTOM_GABARIT");
    expect(label).toBe("CUSTOM GABARIT");
    expect(label).not.toBe("15 m³");
  });

  it("ni vehicleType ni size → fallback PORTEUR de la liste", () => {
    expect(resolveVehicleTypeLabelFromList(types, null, null)).toBe("15 m³");
  });

  it("reprise : repVehicleType=GROS_PORTEUR → 20 m³", () => {
    expect(resolveVehicleTypeLabelFromList(types, "GROS_PORTEUR")).toBe("20 m³");
  });

  it("liste vide → fallback par défaut constant", () => {
    expect(resolveVehicleTypeLabelFromList([], "GROS_PORTEUR")).toBe("GROS PORTEUR");
  });
});

describe("resolveVehicleTypeShortLabelFromList", () => {
  it("VL → VL", () => {
    expect(resolveVehicleTypeShortLabelFromList(types, "VL")).toBe("VL");
  });

  it("gabarit 'N m³' → retourné tel quel", () => {
    expect(resolveVehicleTypeShortLabelFromList(types, "PORTEUR_LEGER")).toBe("10 m³");
    expect(resolveVehicleTypeShortLabelFromList(types, "GROS_PORTEUR")).toBe("20 m³");
  });

  it("Semi-remorque → label sans parenthèses", () => {
    const label = resolveVehicleTypeShortLabelFromList(types, "SEMI_REMORQUE");
    expect(label).toBe("Semi-remorque");
  });

  it("code inconnu → humanisé (via labelFromList)", () => {
    const label = resolveVehicleTypeShortLabelFromList(types, "MY_TYPE");
    expect(label).toBe("MY TYPE");
  });
});
