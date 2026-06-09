import { describe, it, expect } from "vitest";
import {
  DEFAULT_VEHICLE_TYPES,
  RX_DEFAULT_VEHICLE_TYPES,
  PALAIS_DEFAULT_VEHICLE_TYPES,
  getDefaultVehicleTypesForScope,
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

describe("catalogues distincts RX vs Palais", () => {
  it("RX porte le routage Palm Beach / zones", () => {
    const vl = RX_DEFAULT_VEHICLE_TYPES.find((t) => t.code === "VL");
    expect(vl?.rxPalmBeachAtCanto).toBe(true);
    expect(vl?.rxZoneCanto).toBe("PALM_BEACH");
    expect(vl?.rxZoneVieuxPort).toBe("LA_BOCCA");

    const porteur = RX_DEFAULT_VEHICLE_TYPES.find((t) => t.code === "PORTEUR");
    expect(porteur?.rxPalmBeachAtCanto).toBe(false);
    expect(porteur?.rxZoneCanto).toBe("LA_BOCCA");
  });

  it("Palais n'a AUCUN champ de routage RX", () => {
    for (const t of PALAIS_DEFAULT_VEHICLE_TYPES) {
      expect(t.rxPalmBeachAtCanto).toBe(false);
      expect(t.rxZoneCanto).toBeNull();
      expect(t.rxZoneVieuxPort).toBeNull();
    }
  });

  it("Palais conserve les libellés descriptifs historiques", () => {
    const vl = PALAIS_DEFAULT_VEHICLE_TYPES.find((t) => t.code === "VL");
    expect(vl?.label).toBe("Fourgon / VL");
    const dix = PALAIS_DEFAULT_VEHICLE_TYPES.find(
      (t) => t.code === "PORTEUR_LEGER"
    );
    expect(dix?.label).toBe("Porteur léger (10 m³)");
  });

  it("partage les mêmes codes et tonnages techniques", () => {
    const rxByCode = new Map(RX_DEFAULT_VEHICLE_TYPES.map((t) => [t.code, t]));
    for (const p of PALAIS_DEFAULT_VEHICLE_TYPES) {
      const rx = rxByCode.get(p.code);
      expect(rx).toBeDefined();
      expect(p.tonnageMini).toBe(rx!.tonnageMini);
      expect(p.tonnageMaxi).toBe(rx!.tonnageMaxi);
      expect(p.co2Coefficient).toBe(rx!.co2Coefficient);
    }
  });
});

describe("getDefaultVehicleTypesForScope", () => {
  it("renvoie le catalogue Palais pour les slugs Palais", () => {
    expect(getDefaultVehicleTypesForScope("palais-des-festivals")).toBe(
      PALAIS_DEFAULT_VEHICLE_TYPES
    );
    expect(getDefaultVehicleTypesForScope("palais")).toBe(
      PALAIS_DEFAULT_VEHICLE_TYPES
    );
  });

  it("renvoie le catalogue RX pour rx, inconnu ou null", () => {
    expect(getDefaultVehicleTypesForScope("rx")).toBe(RX_DEFAULT_VEHICLE_TYPES);
    expect(getDefaultVehicleTypesForScope(null)).toBe(RX_DEFAULT_VEHICLE_TYPES);
    expect(getDefaultVehicleTypesForScope("autre")).toBe(
      RX_DEFAULT_VEHICLE_TYPES
    );
  });
});
