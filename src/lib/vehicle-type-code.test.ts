import { describe, it, expect } from "vitest";
import {
  suggestVehicleTypeCode,
  isValidVehicleTypeCode,
} from "./vehicle-type-code";
import { generateVehicleTypeCode } from "./vehicle-type-defaults";

describe("suggestVehicleTypeCode", () => {
  it("conserve la valeur exacte de l'appellation (pas de transformation)", () => {
    // Cas clé RX : un code « 15 m³ » doit rester « 15 m³ », pas « 15_M3 ».
    expect(suggestVehicleTypeCode("15 m³")).toBe("15 m³");
    expect(suggestVehicleTypeCode("20 m³")).toBe("20 m³");
    expect(suggestVehicleTypeCode("Porteur")).toBe("Porteur");
  });

  it("retire seulement les espaces de bord", () => {
    expect(suggestVehicleTypeCode("  15 m³  ")).toBe("15 m³");
  });

  it("gère null / undefined / vide", () => {
    expect(suggestVehicleTypeCode(null)).toBe("");
    expect(suggestVehicleTypeCode(undefined)).toBe("");
    expect(suggestVehicleTypeCode("   ")).toBe("");
  });

  it("diffère de generateVehicleTypeCode qui, lui, slugifie", () => {
    // Garde-fou : on ne veut surtout pas imposer le format slugifié.
    expect(suggestVehicleTypeCode("15 m³")).not.toBe(
      generateVehicleTypeCode("15 m³")
    );
    expect(generateVehicleTypeCode("15 m³")).toBe("15_M");
  });
});

describe("isValidVehicleTypeCode", () => {
  it("refuse un code vide", () => {
    expect(isValidVehicleTypeCode("")).toBe(false);
    expect(isValidVehicleTypeCode("   ")).toBe(false);
    expect(isValidVehicleTypeCode(null)).toBe(false);
    expect(isValidVehicleTypeCode(undefined)).toBe(false);
  });

  it("accepte un code non vide, y compris avec espaces internes", () => {
    expect(isValidVehicleTypeCode("15 m³")).toBe(true);
    expect(isValidVehicleTypeCode("VL")).toBe(true);
  });
});
