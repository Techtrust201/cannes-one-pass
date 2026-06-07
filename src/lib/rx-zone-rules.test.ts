import { describe, it, expect } from "vitest";
import {
  suggestZone,
  portFromSector,
  ZONE_LA_BOCCA,
  ZONE_PALM_BEACH,
} from "./rx-zone-rules";

describe("portFromSector", () => {
  it("détecte le Port Canto", () => {
    expect(portFromSector("CANTO — POWER")).toBe("CANTO");
    expect(portFromSector("PORT CANTO — SAIL")).toBe("CANTO");
  });
  it("retombe sur Vieux Port sinon (y compris Palais)", () => {
    expect(portFromSector("VIEUX PORT — QML")).toBe("VIEUX_PORT");
    expect(portFromSector("PALAIS — PALAIS")).toBe("VIEUX_PORT");
    expect(portFromSector("")).toBe("VIEUX_PORT");
  });
});

describe("suggestZone — matrice gabarit × port (Mathieu §8.4)", () => {
  it("Port Canto : VL / 10 m³ / 20 m³ → Palm Beach", () => {
    expect(suggestZone("VL", "CANTO — POWER")).toBe(ZONE_PALM_BEACH);
    expect(suggestZone("PORTEUR_LEGER", "CANTO — POWER")).toBe(ZONE_PALM_BEACH);
    expect(suggestZone("GROS_PORTEUR", "CANTO — POWER")).toBe(ZONE_PALM_BEACH);
  });

  it("Port Canto : porteur 15 m³ / articulé / semi → La Bocca", () => {
    expect(suggestZone("PORTEUR", "CANTO — POWER")).toBe(ZONE_LA_BOCCA);
    expect(suggestZone("PORTEUR_ARTICULE", "CANTO — POWER")).toBe(ZONE_LA_BOCCA);
    expect(suggestZone("SEMI_REMORQUE", "CANTO — POWER")).toBe(ZONE_LA_BOCCA);
  });

  it("Vieux Port : tous les gabarits → La Bocca", () => {
    for (const code of [
      "VL",
      "PORTEUR_LEGER",
      "GROS_PORTEUR",
      "PORTEUR",
      "PORTEUR_ARTICULE",
      "SEMI_REMORQUE",
    ]) {
      expect(suggestZone(code, "VIEUX PORT — QML")).toBe(ZONE_LA_BOCCA);
    }
  });

  it("gabarit inconnu / vide → pas de suggestion (null)", () => {
    expect(suggestZone("", "CANTO — POWER")).toBeNull();
    expect(suggestZone(null, "VIEUX PORT — QML")).toBeNull();
    expect(suggestZone(undefined, "CANTO — POWER")).toBeNull();
  });

  it("accepte un set Palm Beach custom depuis la BDD", () => {
    const custom = new Set(["CUSTOM_SMALL"]);
    expect(suggestZone("CUSTOM_SMALL", "CANTO — POWER", custom)).toBe(
      ZONE_PALM_BEACH
    );
    expect(suggestZone("PORTEUR_LEGER", "CANTO — POWER", custom)).toBe(
      ZONE_LA_BOCCA
    );
  });
});
