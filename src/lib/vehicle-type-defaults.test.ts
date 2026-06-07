import { describe, it, expect } from "vitest";
import {
  DEFAULT_VEHICLE_TYPES,
  buildPalmBeachAtCantoCodes,
} from "./vehicle-type-defaults";

describe("DEFAULT_VEHICLE_TYPES — appellations volume", () => {
  it("n'utilise plus « porteur léger » pour le 10 m³", () => {
    const ten = DEFAULT_VEHICLE_TYPES.find((t) => t.code === "PORTEUR_LEGER");
    expect(ten?.label).toBe("10 m³");
    expect(ten?.gabarit).toBe("10 m³");
    expect(ten?.label).not.toMatch(/porteur/i);
  });

  it("VL a label et gabarit identiques", () => {
    const vl = DEFAULT_VEHICLE_TYPES.find((t) => t.code === "VL");
    expect(vl?.label).toBe("VL");
    expect(vl?.gabarit).toBe("VL");
  });
});

describe("buildPalmBeachAtCantoCodes", () => {
  it("collecte les codes flaggés rxPalmBeachAtCanto", () => {
    const set = buildPalmBeachAtCantoCodes(DEFAULT_VEHICLE_TYPES);
    expect(set.has("VL")).toBe(true);
    expect(set.has("PORTEUR_LEGER")).toBe(true);
    expect(set.has("GROS_PORTEUR")).toBe(true);
    expect(set.has("PORTEUR")).toBe(false);
  });
});
