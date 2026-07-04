import { describe, it, expect } from "vitest";
import type { Vehicle } from "@/types";
import type { VehicleTypeData } from "@/lib/vehicle-utils";
import {
  isHeavyPdfCode,
  resolveVehicleFamilyFromPdfCode,
  resolveVehicleFamilyFromText,
  vehicleIsHeavy,
  isHeavyFromVehicleType,
} from "./vehicle-family";

function makeVehicle(o: Partial<Vehicle>): Vehicle {
  return {
    id: 1,
    plate: "",
    size: "",
    phoneCode: "+33",
    phoneNumber: "",
    date: "",
    time: "",
    city: "",
    unloading: [],
    ...o,
  };
}

function makeType(
  o: Partial<VehicleTypeData> & { code: string; pdfCode: VehicleTypeData["pdfCode"] }
): VehicleTypeData {
  return {
    id: 1,
    label: o.code,
    gabarit: o.gabarit ?? o.code,
    tonnageMini: 0,
    tonnageMoyen: 0,
    tonnageMaxi: 0,
    co2Coefficient: 0,
    color: "gray",
    showTrailerPlate: false,
    rxPalmBeachAtCanto: false,
    rxZoneCanto: null,
    rxZoneVieuxPort: null,
    sortOrder: 1,
    isActive: true,
    ...o,
  };
}

const types: VehicleTypeData[] = [
  makeType({ id: 1, code: "VL", pdfCode: "A" }),
  makeType({ id: 2, code: "PORTEUR_LEGER", pdfCode: "B", gabarit: "10 m³" }),
  makeType({ id: 3, code: "PORTEUR", pdfCode: "C", gabarit: "15 m³" }),
  makeType({ id: 4, code: "GROS_PORTEUR", pdfCode: "C", gabarit: "20 m³" }),
  makeType({ id: 5, code: "SEMI_REMORQUE", pdfCode: "D", gabarit: "Semi-remorque" }),
];

describe("isHeavyPdfCode", () => {
  it("C et D = heavy", () => {
    expect(isHeavyPdfCode("C")).toBe(true);
    expect(isHeavyPdfCode("D")).toBe(true);
  });

  it("A et B = light", () => {
    expect(isHeavyPdfCode("A")).toBe(false);
    expect(isHeavyPdfCode("B")).toBe(false);
    expect(isHeavyPdfCode(null)).toBe(false);
    expect(isHeavyPdfCode(undefined)).toBe(false);
  });
});

describe("resolveVehicleFamilyFromPdfCode", () => {
  it("mappe pdfCode vers LIGHT/HEAVY", () => {
    expect(resolveVehicleFamilyFromPdfCode("A")).toBe("LIGHT");
    expect(resolveVehicleFamilyFromPdfCode("C")).toBe("HEAVY");
  });
});

describe("resolveVehicleFamilyFromText — fallback RX", () => {
  it("LIGHT : VL, 10/15/20 m³", () => {
    expect(resolveVehicleFamilyFromText("VL")).toBe("LIGHT");
    expect(resolveVehicleFamilyFromText("10 m³")).toBe("LIGHT");
    expect(resolveVehicleFamilyFromText("15 m³")).toBe("LIGHT");
    expect(resolveVehicleFamilyFromText("20 m³")).toBe("LIGHT");
  });

  it("HEAVY : Porteur, articulé, semi-remorque", () => {
    expect(resolveVehicleFamilyFromText("Porteur")).toBe("HEAVY");
    expect(resolveVehicleFamilyFromText("Porteur articulé")).toBe("HEAVY");
    expect(resolveVehicleFamilyFromText("Semi-remorque")).toBe("HEAVY");
  });

  it("texte vide → LIGHT", () => {
    expect(resolveVehicleFamilyFromText("")).toBe("LIGHT");
    expect(resolveVehicleFamilyFromText(null)).toBe("LIGHT");
  });
});

describe("vehicleIsHeavy", () => {
  it("priorise pdfCode config sur fallback texte", () => {
    // GROS_PORTEUR a pdfCode C → HEAVY même si le gabarit contient « 20 m³ »
    expect(
      vehicleIsHeavy(types, makeVehicle({ vehicleType: "GROS_PORTEUR", size: "20 m³" }))
    ).toBe(true);
    expect(
      vehicleIsHeavy(types, makeVehicle({ vehicleType: "VL", size: "VL" }))
    ).toBe(false);
  });

  it("fallback texte si type inconnu du catalogue", () => {
    expect(
      vehicleIsHeavy(types, makeVehicle({ vehicleType: undefined, size: "Semi-remorque" }))
    ).toBe(true);
    expect(
      vehicleIsHeavy(types, makeVehicle({ vehicleType: undefined, size: "15 m³" }))
    ).toBe(true);
  });
});

describe("isHeavyFromVehicleType", () => {
  it("délègue à pdfCode", () => {
    expect(isHeavyFromVehicleType({ pdfCode: "D" })).toBe(true);
    expect(isHeavyFromVehicleType({ pdfCode: "B" })).toBe(false);
  });
});
